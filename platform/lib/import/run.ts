// Sheet payload → MariaDB. Shared by the cron CLI (scripts/import-sheet.ts) and by the creator edit/add API, which
// re-imports right after writing the Sheet so the DB always comes from the Sheet through ONE mapping (lib/import/sheet.ts).
// Returns counts only. Creators missing from the Sheet are soft-deleted; a run that would drop >20% vs the last good
// run aborts (protects against a short Sheet read).
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import { channels, contacts, creators, rates, syncRuns } from "../db/schema";
import { buildRecords, type SheetPayload } from "./sheet";

export type ImportSummary = {
  dryRun: boolean;
  rowsRead: number;
  creators: number;
  deletedInOldApp: number;
  skipped: Record<string, number>;
  withChannels: number;
  withFollowers: number;
  withPrices: number;
  priceCellsNotNumeric: number;
  withContact: number;
  heroUnknown: number;
};

export async function importPayload(payload: SheetPayload, opts: { dry?: boolean; force?: boolean; kind?: string } = {}): Promise<ImportSummary> {
  const dry = !!opts.dry;
  const [run] = await db()
    .insert(syncRuns)
    .values({ kind: opts.kind ?? "sheet_import", dryRun: dry ? 1 : 0, startedAt: new Date(), status: "running" })
    .$returningId();
  const finish = (v: Partial<typeof syncRuns.$inferInsert>) => db().update(syncRuns).set({ finishedAt: new Date(), ...v }).where(eq(syncRuns.id, run.id));
  try {
    const b = buildRecords(payload);
    const summary: ImportSummary = {
      dryRun: dry,
      rowsRead: b.rowsRead,
      creators: b.records.length,
      deletedInOldApp: b.deletedIds.length,
      skipped: b.skipped,
      withChannels: b.records.filter((r) => r.channels.length).length,
      withFollowers: b.records.filter((r) => r.channels.some((c) => c.followers)).length,
      withPrices: b.records.filter((r) => r.rates.some((x) => x.amount)).length,
      priceCellsNotNumeric: b.records.reduce((n, r) => n + r.rates.filter((x) => x.amount === null).length, 0),
      withContact: b.records.filter((r) => Object.values(r.contact).some(Boolean)).length,
      heroUnknown: b.records.filter((r) => !r.creator.heroPlatform).length,
    };
    const [last] = await db()
      .select()
      .from(syncRuns)
      .where(and(inArray(syncRuns.kind, ["sheet_import", "sheet_import_api"]), eq(syncRuns.status, "ok"), eq(syncRuns.dryRun, 0)))
      .orderBy(desc(syncRuns.id))
      .limit(1);
    if (!opts.force && last?.rowsImported && b.records.length < last.rowsImported * 0.8)
      throw new Error(`guard_drop: ${b.records.length} < 80% of last run ${last.rowsImported}`);
    if (b.records.length === 0) throw new Error("guard_empty");

    if (!dry) {
      const now = new Date();
      const ids = b.records.map((r) => r.id);
      await db().transaction(async (tx) => {
        for (const r of b.records) {
          await tx
            .insert(creators)
            .values({ id: r.id, sheetRow: r.sheetRow, ...r.creator, source: "sheet", syncedAt: now, createdAt: now, updatedAt: now })
            .onDuplicateKeyUpdate({ set: { sheetRow: r.sheetRow, ...r.creator, source: "sheet", syncedAt: now, updatedAt: now, deletedAt: null } });
        }
        for (let i = 0; i < ids.length; i += 200) {
          const part = ids.slice(i, i + 200);
          await tx.delete(channels).where(inArray(channels.creatorId, part));
          await tx.delete(rates).where(inArray(rates.creatorId, part));
          await tx.delete(contacts).where(inArray(contacts.creatorId, part));
        }
        const ch = b.records.flatMap((r) =>
          r.channels.map((c) => ({ creatorId: r.id, ...c, followersSource: c.followers ? ("sheet" as const) : null, followersUpdatedAt: c.followers ? now : null })),
        );
        const rt = b.records.flatMap((r) => r.rates.map((x) => ({ creatorId: r.id, ...x, source: "Google Sheet", updatedAt: now })));
        const ct = b.records.filter((r) => Object.values(r.contact).some(Boolean)).map((r) => ({ creatorId: r.id, ...r.contact, updatedAt: now }));
        for (let i = 0; i < ch.length; i += 500) await tx.insert(channels).values(ch.slice(i, i + 500));
        for (let i = 0; i < rt.length; i += 500) await tx.insert(rates).values(rt.slice(i, i + 500));
        for (let i = 0; i < ct.length; i += 500) await tx.insert(contacts).values(ct.slice(i, i + 500));
        await tx.update(creators).set({ deletedAt: now }).where(and(eq(creators.source, "sheet"), isNull(creators.deletedAt), notInArray(creators.id, ids)));
      });
    }
    await finish({
      status: "ok",
      rowsRead: b.rowsRead,
      rowsImported: b.records.length,
      rowsSkipped: Object.values(b.skipped).reduce((a, n) => a + n, 0),
      skipReasons: JSON.stringify(b.skipped),
    });
    return summary;
  } catch (e) {
    await finish({ status: "failed", error: (e as Error).message.slice(0, 300) }).catch(() => {});
    throw e;
  }
}

// Sheet → MariaDB importer. Reads the bridge payload on stdin, prints COUNTS ONLY (never names, phones, emails).
//   php bridge/sheet-export.php | node dist/import-sheet.cjs --dry-run
//   php bridge/sheet-export.php | node dist/import-sheet.cjs
// The Sheet stays master: creator fields, channels, rates and contacts are overwritten from it on every run.
// Creators missing from the Sheet are soft-deleted; a run that would drop >20% vs the last good run aborts.
import { existsSync } from "node:fs";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { closeDb, db } from "../lib/db/client";
import { channels, contacts, creators, rates, syncRuns } from "../lib/db/schema";
import { buildRecords, type SheetPayload } from "../lib/import/sheet";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const started = new Date();
  const [run] = await db()
    .insert(syncRuns)
    .values({ kind: "sheet_import", dryRun: dry ? 1 : 0, startedAt: started, status: "running" })
    .$returningId();
  const finish = (v: Partial<typeof syncRuns.$inferInsert>) =>
    db().update(syncRuns).set({ finishedAt: new Date(), ...v }).where(eq(syncRuns.id, run.id));

  try {
    const raw = await readStdin();
    if (!raw.trim()) throw new Error("empty_input");
    const payload = JSON.parse(raw) as SheetPayload;
    const b = buildRecords(payload);
    const summary = {
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
      .where(and(eq(syncRuns.kind, "sheet_import"), eq(syncRuns.status, "ok"), eq(syncRuns.dryRun, 0)))
      .orderBy(desc(syncRuns.id))
      .limit(1);
    if (!force && last?.rowsImported && b.records.length < last.rowsImported * 0.8)
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
        // Sheet creators no longer present (or deleted in the old app) → soft delete. v2-created creators are untouched.
        await tx
          .update(creators)
          .set({ deletedAt: now })
          .where(and(eq(creators.source, "sheet"), isNull(creators.deletedAt), notInArray(creators.id, ids)));
      });
    }
    await finish({
      status: "ok",
      rowsRead: b.rowsRead,
      rowsImported: b.records.length,
      rowsSkipped: Object.values(b.skipped).reduce((a, n) => a + n, 0),
      skipReasons: JSON.stringify(b.skipped),
    });
    console.log(JSON.stringify({ ok: true, ...summary }));
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await finish({ status: "failed", error: msg }).catch(() => {});
    console.error(JSON.stringify({ ok: false, error: msg }));
    process.exitCode = 1;
  }
}

main().finally(() => closeDb());

// Applies drizzle/*.sql to DATABASE_URL. Bundled to dist/migrate.cjs (esbuild) so it runs on the host with plain node:
//   node dist/migrate.cjs        (reads DATABASE_URL, or MKV2_ENV_FILE / ~/markus-v2-state/runtime.env when present)
import { existsSync } from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { closeDb, db, pool } from "../lib/db/client";

async function main() {
  const envFile = process.env.MKV2_ENV_FILE || "/home/thestvco/markus-v2-state/runtime.env";
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const folder = path.resolve(__dirname, "..", "drizzle");
  await migrate(db(), { migrationsFolder: folder });
  const [rows] = await pool().query("SELECT @@collation_database AS c, COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()");
  const r = (rows as { c: string; n: number }[])[0];
  console.log(JSON.stringify({ ok: true, collation: r?.c, tables: Number(r?.n) }));
}

main()
  .catch((e) => {
    console.error("migrate failed:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

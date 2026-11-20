// One small mysql2 pool per Node process, kept on globalThis so dev hot-reload and route modules share it.
// Passenger may run several processes and shared hosting caps connections per DB user, so the limit is low.
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

type Db = MySql2Database<typeof schema>;
const g = globalThis as unknown as { __mkv2Pool?: mysql.Pool; __mkv2Db?: Db };

export function pool(): mysql.Pool {
  if (!g.__mkv2Pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__mkv2Pool = mysql.createPool({
      uri: url,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 4),
      timezone: "Z",
      charset: "UTF8MB4_UNICODE_520_CI",
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
  }
  return g.__mkv2Pool;
}

export function db(): Db {
  if (!g.__mkv2Db) g.__mkv2Db = drizzle(pool(), { schema, mode: "default" });
  return g.__mkv2Db;
}

export async function closeDb(): Promise<void> {
  const p = g.__mkv2Pool;
  g.__mkv2Pool = undefined;
  g.__mkv2Db = undefined;
  if (p) await p.end();
}

// Who may log in, and with which role. Production: the Employees tab of the CREATOR_DB Sheet (A=name, B=role, C=email),
// read with the service account — the same source PHP uses. Local/tests: the users table.
// Cached 60 s per process; on a read failure a cache up to 15 min old is used, otherwise fail closed (503).
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { fail } from "../http";
import { roleFromText, type Role } from "./roles";

export type Employee = { email: string; name: string; role: Role };
export interface Directory {
  // fresh = bypass the cache (used at login, like PHP mk_employee_lookup($email, true)).
  lookup(email: string, fresh?: boolean): Promise<Employee | null>;
}

const TTL_MS = 60_000;
const STALE_MAX_MS = 900_000;

export class DbDirectory implements Directory {
  async lookup(email: string): Promise<Employee | null> {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    const [u] = await db().select().from(users).where(eq(users.email, e)).limit(1);
    return u ? { email: u.email, name: u.name, role: u.role } : null;
  }
}

export function parseEmployees(rows: unknown[][]): Employee[] {
  const out: Employee[] = [];
  for (const r of rows) {
    const email = String(r?.[2] ?? "").trim().toLowerCase();
    if (!email) continue;
    out.push({ email, name: String(r?.[0] ?? "").trim(), role: roleFromText(r?.[1]) });
  }
  return out;
}

type Fetcher = typeof fetch;

export class SheetDirectory implements Directory {
  private cache: { at: number; rows: Employee[] } | null = null;
  private token: { value: string; exp: number } | null = null;
  constructor(
    private readonly sheetId: string,
    private readonly saPath: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > this.now() + 120_000) return this.token.value;
    const sa = JSON.parse(readFileSync(this.saPath, "utf8")) as { client_email?: string; private_key?: string };
    if (!sa.client_email || !sa.private_key) fail(500, "service_account_invalid");
    const key = await importPKCS8(sa.private_key as string, "RS256");
    const iat = Math.floor(this.now() / 1000);
    const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets.readonly" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(sa.client_email as string)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(iat)
      .setExpirationTime(iat + 3600)
      .sign(key);
    const res = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    const d = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !d.access_token) fail(502, "google_token_failed");
    this.token = { value: d.access_token as string, exp: this.now() + (d.expires_in ?? 3000) * 1000 };
    return this.token.value;
  }

  private async read(): Promise<Employee[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.sheetId)}/values/${encodeURIComponent("Employees!A2:C200")}?valueRenderOption=FORMATTED_VALUE`;
    const res = await this.fetcher(url, { headers: { authorization: `Bearer ${await this.accessToken()}` } });
    if (!res.ok) fail(502, "sheet_rejected");
    const d = (await res.json()) as { values?: unknown[][] };
    return parseEmployees(Array.isArray(d.values) ? d.values : []);
  }

  async rows(fresh = false): Promise<Employee[]> {
    const t = this.now();
    if (!fresh && this.cache && t - this.cache.at < TTL_MS) return this.cache.rows;
    try {
      const rows = await this.read();
      this.cache = { at: t, rows };
      return rows;
    } catch (e) {
      if (!fresh && this.cache && t - this.cache.at < STALE_MAX_MS) return this.cache.rows;
      console.error("[mkv2] employees lookup failed", (e as Error)?.message?.slice(0, 120));
      return fail(503, "directory_unavailable");
    }
  }

  async lookup(email: string, fresh = false): Promise<Employee | null> {
    const e = email.trim().toLowerCase();
    if (!e) return null;
    return (await this.rows(fresh)).find((r) => r.email === e) ?? null;
  }
}

const g = globalThis as unknown as { __mkv2Dir?: Directory };
export function directory(): Directory {
  if (!g.__mkv2Dir) {
    if (env.directory() === "db") g.__mkv2Dir = new DbDirectory();
    else {
      if (!env.sheetId() || !env.serviceAccountPath()) fail(500, "directory_not_configured");
      g.__mkv2Dir = new SheetDirectory(env.sheetId(), env.serviceAccountPath());
    }
  }
  return g.__mkv2Dir as Directory;
}
export function setDirectoryForTests(d: Directory | undefined): void {
  g.__mkv2Dir = d;
}

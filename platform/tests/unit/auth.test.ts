import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { parseEmployees, SheetDirectory } from "@/lib/auth/directory";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { can, PERMS, roleFromText } from "@/lib/auth/roles";
import { HttpError } from "@/lib/http";
import { fakeGoogle } from "../helpers/google-keys";

const AUD = "test-client.apps.googleusercontent.com";

describe("roleFromText", () => {
  it.each([
    ["Admin", "admin"],
    [" owner ", "admin"],
    ["Manager", "manager"],
    ["Quản lý", "manager"],
    ["planner", "planner"],
    ["Account", "planner"],
    ["Booker", "planner"],
    ["viewer", "viewer"],
    ["", "viewer"],
    ["superuser", "viewer"],
    [undefined, "viewer"],
  ])("%s → %s", (raw, role) => expect(roleFromText(raw)).toBe(role));

  it("viewer has no permission; only admin/manager see every campaign", () => {
    expect(PERMS.viewer).toEqual([]);
    expect(can("manager", "allCampaigns")).toBe(true);
    expect(can("planner", "allCampaigns")).toBe(false);
    expect(can("planner", "price")).toBe(true);
  });
});

describe("verifyGoogleIdToken", () => {
  const ok = { email: "A@Markus.test", email_verified: true, name: "A" };

  it("accepts a valid token and lower-cases the email", async () => {
    const g = await fakeGoogle();
    const c = await verifyGoogleIdToken(await g.sign(ok), { audience: AUD, keys: g.keys });
    expect(c.email).toBe("a@markus.test");
  });

  it.each([
    ["wrong audience", { aud: "other" }, ok],
    ["wrong issuer", { iss: "https://evil.example" }, ok],
    ["expired beyond 60 s leeway", { expSec: -120 }, ok],
    ["unverified email", {}, { ...ok, email_verified: false }],
    ["missing email", {}, { email_verified: true }],
  ])("rejects %s", async (_n, opts, claims) => {
    const g = await fakeGoogle();
    const tok = await g.sign(claims as Record<string, unknown>, opts);
    await expect(verifyGoogleIdToken(tok, { audience: AUD, keys: g.keys })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a token signed by another key, garbage and oversized input", async () => {
    const g = await fakeGoogle();
    const other = await fakeGoogle();
    await expect(verifyGoogleIdToken(await other.sign(ok), { audience: AUD, keys: g.keys })).rejects.toBeInstanceOf(HttpError);
    await expect(verifyGoogleIdToken("a.b.c", { audience: AUD, keys: g.keys })).rejects.toBeInstanceOf(HttpError);
    await expect(verifyGoogleIdToken("x".repeat(5000), { audience: AUD, keys: g.keys })).rejects.toBeInstanceOf(HttpError);
    await expect(verifyGoogleIdToken(123, { audience: AUD, keys: g.keys })).rejects.toBeInstanceOf(HttpError);
  });
});

describe("Employees directory (Sheet)", () => {
  it("parses rows: name, role, email; skips rows without email", () => {
    expect(
      parseEmployees([
        ["Ngọc Anh", "Planner", " NgocAnh@Markus.test "],
        ["No mail", "Admin", ""],
        ["Boss", "Manager", "boss@markus.test"],
      ]),
    ).toEqual([
      { email: "ngocanh@markus.test", name: "Ngọc Anh", role: "planner" },
      { email: "boss@markus.test", name: "Boss", role: "manager" },
    ]);
  });

  async function setup() {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const dir = mkdtempSync(path.join(tmpdir(), "mkv2-sa-"));
    const sa = path.join(dir, "sa.json");
    writeFileSync(sa, JSON.stringify({ client_email: "sa@test.iam.gserviceaccount.com", private_key: await exportPKCS8(privateKey) }));
    let t = 1_000_000;
    let sheetUp = true;
    let sheetCalls = 0;
    const fetcher = (async (url: string | URL) => {
      const u = String(url);
      if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
      sheetCalls++;
      if (!sheetUp) return new Response("down", { status: 500 });
      return Response.json({ values: [["Ngọc Anh", "Planner", "ngocanh@markus.test"]] });
    }) as typeof fetch;
    const d = new SheetDirectory("sheet-id", sa, fetcher, () => t);
    return { d, advance: (ms: number) => (t += ms), down: () => (sheetUp = false), calls: () => sheetCalls };
  }

  it("caches 60 s, serves a stale copy up to 15 min when the Sheet fails, then fails closed", async () => {
    const s = await setup();
    expect(await s.d.lookup("ngocanh@markus.test")).toMatchObject({ role: "planner" });
    s.advance(30_000);
    await s.d.lookup("ngocanh@markus.test");
    expect(s.calls()).toBe(1);
    s.down();
    s.advance(120_000);
    expect(await s.d.lookup("ngocanh@markus.test")).toMatchObject({ role: "planner" });
    s.advance(900_000);
    await expect(s.d.lookup("ngocanh@markus.test")).rejects.toMatchObject({ status: 503 });
  });

  it("a fresh lookup (login) bypasses the cache and fails closed instead of using a stale copy", async () => {
    const s = await setup();
    await s.d.lookup("ngocanh@markus.test");
    await s.d.lookup("ngocanh@markus.test", true);
    expect(s.calls()).toBe(2);
    s.down();
    await expect(s.d.lookup("ngocanh@markus.test", true)).rejects.toMatchObject({ status: 503 });
  });

  it("unknown email → null", async () => {
    const s = await setup();
    expect(await s.d.lookup("someone@else.test")).toBeNull();
  });
});

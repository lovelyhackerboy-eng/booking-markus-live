import { describe, expect, it } from "vitest";
import { parsePlan } from "@/lib/admin/system";

// Shape of `uapi --output=json ResourceUsage get_usages` on the AZDIGI host (25/11/2026), trimmed.
const SAMPLE = JSON.stringify({
  apiversion: 3, module: "ResourceUsage", func: "get_usages",
  result: { status: 1, errors: null, data: [
    { id: "disk_usage", usage: 8140696662, maximum: "12884901888" },
    { id: "cachedmysqldiskusage", usage: 349899862, maximum: "5094105088" },
    { id: "bandwidth", usage: "28286934720", maximum: null },
    { id: "addon_domains", usage: 9, maximum: "9" },
    { id: "email_accounts", usage: "8", maximum: null },
    { id: "lvecpu", usage: 97, maximum: 150 },
    { id: "lveep", usage: 3, maximum: 100 },
    { id: "lvememphy", usage: 124981248, maximum: 1610612736 },
    { id: "lveiops", usage: 0, maximum: 1500 },
    { id: "lveio", usage: 0, maximum: 15728640 },
    { id: "lvenproc", usage: 33, maximum: 120 },
  ] },
});

describe("hosting plan (uapi ResourceUsage)", () => {
  it("keeps only the account meters, with limits", () => {
    const p = parsePlan(SAMPLE, new Date("2026-11-25T02:00:00Z"))!;
    expect(p.cpu).toEqual({ used: 97, limit: 150 }); // % of one core; 150 = 1.5 cores
    expect(p.memory).toEqual({ used: 124981248, limit: 1610612736 });
    expect(p.processes).toEqual({ used: 33, limit: 120 });
    expect(p.entryProcesses).toEqual({ used: 3, limit: 100 });
    expect(p.disk).toEqual({ used: 8140696662, limit: 12884901888 });
    expect(p.mysqlDisk.limit).toBe(5094105088);
    expect(JSON.stringify(p)).not.toMatch(/domain|email|bandwidth/i);
  });
  it("returns null on errors or missing meters (never falls back to host numbers)", () => {
    expect(parsePlan("not json")).toBeNull();
    expect(parsePlan(JSON.stringify({ result: { status: 0, data: [] } }))).toBeNull();
    expect(parsePlan(JSON.stringify({ result: { status: 1, data: [{ id: "disk_usage", usage: 1, maximum: 2 }] } }))).toBeNull();
  });
});

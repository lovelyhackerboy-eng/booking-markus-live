import { describe, expect, it } from "vitest";
import { buildRecords, columnIndex, headerKey, heroOf, parseCount, parsePrice } from "@/lib/import/sheet";

// The real CREATOR_DB header (37 columns), with fake rows.
const HEADER = [
  "STT", "Creator_Name", "Tier", "Primary_Category", "Secondary_Category", "Creator_Type", "Casting_Profile", "Year_Of_Birth",
  "Base_Location", "Age", "Age_Band", "Representation", "Contact_Person", "Contact_Channel", "Contact_Detail", "Company_Email",
  "Company_Phone", "Company_Website", "Personal_Email", "Personal_Phone", "Note", "Hero_Platform", "TikTok", "Sub_TikTok",
  "Facebook", "Sub_Facebook", "Instagram", "Sub_IG", "Youtube", "Sub_Youtube", "Threads", "Relationship_Status", "Photo Post",
  "Video Post", "Tham gia sự kiện", "Tham gia video của nhãn hàng", "Livestream",
];
const row = (over: Record<string, string>) => HEADER.map((h) => over[h] ?? "");
const UID1 = "cr_0123456789abcdef";
const UID2 = "cr_fedcba9876543210";

describe("header mapping", () => {
  it("normalises Vietnamese headers", () => {
    expect(headerKey("Tham gia sự kiện")).toBe("thamgiasukien");
    expect(headerKey("Tham gia video của nhãn hàng")).toBe("thamgiavideocuanhanhang");
    expect(headerKey("Sub_IG")).toBe("subig");
  });
  it("finds all 37 columns and reports nothing missing", () => {
    const { idx, missing } = columnIndex(HEADER);
    expect(missing).toEqual([]);
    expect(idx.subInstagram).toBe(27);
    expect(idx.live).toBe(36);
  });
  it("aborts when a required column disappears", () => {
    expect(() => buildRecords({ header: HEADER.filter((h) => h !== "Sub_TikTok"), rows: [], links: [], uids: [] })).toThrow(/missing subTiktok/);
  });
});

describe("value parsing", () => {
  it.each([
    ["86,000", 86000], ["86.000", 86000], ["86K", 86000], ["1,2M", 1200000], ["1.2tr", 1200000], ["320 N", 320000],
    ["1.234.567", 1234567], ["", null], ["n/a", null], ["~50k", null],
  ])("count %s → %s", (raw, n) => expect(parseCount(raw)).toBe(n));
  it.each([
    ["12,000,000", 12000000], ["12tr", 12000000], ["15M", 15000000], ["8.500.000 đ", 8500000], ["Thương lượng", null], ["12", null],
    ["1 video tiktok: 12,000,000", 12000000],
    ["2 video + đăng FB: 15tr | 1 video 30s: 9,5tr", 9500000],
    ["1 video 60s ngang/dọc: 20.000.000 (chưa VAT)", 20000000],
    ["Báo giá theo gói 3 video", null],
    ["500k / story", 500000],
  ])("price %s → %s", (raw, n) => expect(parsePrice(raw).amount).toBe(n));
  it("follower shorthand 1m2 / 8k5", () => {
    expect(parseCount("1m2")).toBe(1200000);
    expect(parseCount("8k5")).toBe(8500);
  });
  it("keeps the raw price text", () => expect(parsePrice("Thương lượng").text).toBe("Thương lượng"));
  it.each([["TikTok", "tiktok"], ["FB", "facebook"], ["Instagram", "instagram"], ["Youtube", "youtube"], ["?", null]])(
    "hero %s → %s",
    (raw, p) => expect(heroOf(raw)).toBe(p),
  );
});

describe("buildRecords", () => {
  const payload = () => ({
    header: HEADER,
    rows: [
      row({ Creator_Name: "Fake A", Tier: "Micro", Hero_Platform: "TikTok", TikTok: "@fakea", Sub_TikTok: "86,000", "Video Post": "12tr", "Photo Post": "Thương lượng", Personal_Phone: "0900 000 001", Year_Of_Birth: "1995" }),
      row({ Creator_Name: "Fake B", Youtube: "Fake B channel", Sub_Youtube: "1,2M" }),
      row({ Creator_Name: "Quarantined" }),
      row({}),
      row({ Creator_Name: "" }),
    ],
    links: [{ tiktok: "https://www.tiktok.com/@fakea" }, { youtube: "https://youtube.com/@fakeb" }, {}, {}, {}],
    uids: [UID1, UID2, null, null, null],
    statuses: ["bound", "new", "quarantine:shared_url", null, null],
  });

  it("maps a creator with channels, rates and contact; sheetRow is the real Sheet row", () => {
    const b = buildRecords(payload());
    expect(b.records).toHaveLength(2);
    const a = b.records[0];
    expect(a).toMatchObject({ id: UID1, sheetRow: 4, creator: { name: "Fake A", tier: "Micro", heroPlatform: "tiktok", yearOfBirth: 1995 } });
    expect(a.channels).toEqual([{ platform: "tiktok", url: "https://www.tiktok.com/@fakea", label: "@fakea", followers: 86000 }]);
    expect(a.rates).toEqual([
      { sow: "photo", amount: null, amountText: "Thương lượng" },
      { sow: "video", amount: 12000000, amountText: "12tr" },
    ]);
    expect(a.contact.personalPhone).toBe("0900 000 001");
    expect(b.records[1].channels[0]).toMatchObject({ platform: "youtube", followers: 1200000 });
  });

  it("counts skipped rows by reason and ignores empty rows", () => {
    expect(buildRecords(payload()).skipped).toEqual({ "quarantine:shared_url": 1 });
    expect(buildRecords({ ...payload(), rows: [...payload().rows, row({ STT: "99" })], uids: [...payload().uids, null] }).skipped).toEqual({ "quarantine:shared_url": 1 });
  });

  it("a row deleted in the old app becomes a delete, not a nameless creator", () => {
    const p = payload();
    const b = buildRecords({ ...p, deleted: [false, true, false, false, false], rows: [p.rows[0], HEADER.map(() => ""), ...p.rows.slice(2)] });
    expect(b.deletedIds).toEqual([UID2]);
    expect(b.records.map((r) => r.id)).toEqual([UID1]);
  });

  it("rejects malformed and duplicate uids", () => {
    const p = payload();
    const b = buildRecords({ ...p, uids: [UID1, UID1, null, null, null] });
    expect(b.records).toHaveLength(1);
    expect(b.skipped.duplicate_uid).toBe(1);
    expect(buildRecords({ ...p, uids: ["x", null, null, null, null] }).skipped.bad_uid).toBe(1);
  });
});

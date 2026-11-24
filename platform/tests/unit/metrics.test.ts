import { describe, expect, it } from "vitest";
import { average, computeMetrics, inWindow, sampleOf, vnDay } from "@/lib/metrics/compute";
import { clipKey } from "@/lib/metrics/service";
import { DEFAULT_METRICS } from "@/lib/metrics/settings";
import { channelPageUrl, parseCount, parseFeed } from "@/lib/metrics/youtube";
import { platformOf } from "@/lib/posts/service";

const NOW = new Date("2026-11-25T03:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 864e5);
const clip = (n: number, views: number | null, likes: number | null = null, comments: number | null = null, shares: number | null = null) => ({ publishedAt: day(n), views, likes, comments, shares });

describe("average", () => {
  it("mean, median (odd/even), trimmed", () => {
    expect(average([1, 2, 3, 100], "mean")).toBe(26.5);
    expect(average([5, 1, 3], "median")).toBe(3);
    expect(average([1, 2, 3, 100], "median")).toBe(2.5);
    expect(average([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000], "trimmed", 10)).toBe(5.5); // drops 1 and 1000
    expect(average([], "mean")).toBeNull();
  });
  it("trimmed never trims everything away", () => {
    expect(average([10, 20], "trimmed", 40)).toBe(15);
  });
});

describe("computeMetrics", () => {
  const s = { ...DEFAULT_METRICS, sampleSize: 5, minSample: 3, method: "mean" as const, maxAgeDays: 90 };
  it("uses the N most recent clips inside maxAgeDays", () => {
    const clips = [clip(1, 100), clip(2, 200), clip(3, 300), clip(4, 400), clip(5, 500), clip(6, 9999), clip(200, 1e9)];
    expect(sampleOf(clips, s, NOW).map((c) => c.views)).toEqual([100, 200, 300, 400, 500]);
    expect(computeMetrics(clips, null, s, NOW)).toMatchObject({ avgViews: 300, sampleSize: 5 });
  });
  it("below minSample → no numbers, but the sample size is reported", () => {
    expect(computeMetrics([clip(1, 100), clip(2, 200)], null, s, NOW)).toEqual({ avgViews: null, er: null, sampleSize: 2 });
  });
  it("ER per clip on views, with configurable parts; unknown parts count as 0 only if some part is known", () => {
    const clips = [clip(1, 1000, 50, 10, 0), clip(2, 1000, 30, null, null), clip(3, 1000, 20, 0, 0)];
    expect(computeMetrics(clips, null, s, NOW).er).toBeCloseTo((6 + 3 + 2) / 3, 2);
    expect(computeMetrics(clips, null, { ...s, erComments: false, erShares: false }, NOW).er).toBeCloseTo((5 + 3 + 2) / 3, 2);
    // no interaction data at all → no ER
    expect(computeMetrics([clip(1, 10), clip(2, 10), clip(3, 10)], null, s, NOW).er).toBeNull();
  });
  it("ER on followers", () => {
    const clips = [clip(1, 1000, 100), clip(2, 1000, 100), clip(3, 1000, 100)];
    expect(computeMetrics(clips, 10000, { ...s, erBase: "followers" }, NOW).er).toBe(1);
    expect(computeMetrics(clips, null, { ...s, erBase: "followers" }, NOW).er).toBeNull();
  });
});

describe("tracking window (Vietnam days, inclusive)", () => {
  const from = new Date("2026-12-01T00:00:00Z"), to = new Date("2026-12-20T00:00:00Z");
  it("a video at 23:00 VN on the last day counts; 00:30 VN the next day does not", () => {
    expect(inWindow(new Date("2026-12-20T16:00:00Z"), from, to)).toBe(true); // 23:00 VN 20/12
    expect(inWindow(new Date("2026-12-20T17:30:00Z"), from, to)).toBe(false); // 00:30 VN 21/12
    expect(inWindow(new Date("2026-11-30T17:30:00Z"), from, to)).toBe(true); // 00:30 VN 01/12
    expect(inWindow(new Date("2026-11-30T16:30:00Z"), from, to)).toBe(false); // 23:30 VN 30/11
    expect(inWindow(new Date("2027-05-01T00:00:00Z"), from, null)).toBe(true); // open end
    expect(inWindow(null, from, to)).toBe(false);
    expect(vnDay(new Date("2026-12-20T17:30:00Z"))).toBe("2026-12-21");
  });
});

describe("YouTube parsing", () => {
  it("accepts channel URLs only, https youtube hosts only", () => {
    expect(channelPageUrl("https://www.youtube.com/@abc/videos")).toBe("https://www.youtube.com/@abc");
    expect(channelPageUrl("https://youtube.com/channel/UC1234567890123456789012")).toBe("https://www.youtube.com/channel/UC1234567890123456789012");
    expect(channelPageUrl("https://www.youtube.com/watch?v=xyz")).toBeNull();
    expect(channelPageUrl("https://evil.example/@abc")).toBeNull();
    expect(channelPageUrl("https://youtube.com.evil.example/@abc")).toBeNull();
    expect(channelPageUrl("javascript:alert(1)")).toBeNull();
  });
  it("parses the RSS feed", () => {
    const xml = `<feed><entry><yt:videoId>abcDEF12345</yt:videoId><title>Hello &amp; bye</title><published>2026-11-20T10:00:00+00:00</published>
      <media:group><media:community><media:starRating count="321" average="5.00"/><media:statistics views="45678"/></media:community></media:group></entry>
      <entry><yt:videoId>zzz9999zzzz</yt:videoId><title>Two</title><published>2026-11-19T10:00:00+00:00</published><media:statistics views="12"/></entry></feed>`;
    expect(parseFeed(xml)).toEqual([
      { externalId: "abcDEF12345", url: "https://www.youtube.com/watch?v=abcDEF12345", title: "Hello & bye", publishedAt: new Date("2026-11-20T10:00:00Z"), views: 45678, likes: 321 },
      { externalId: "zzz9999zzzz", url: "https://www.youtube.com/watch?v=zzz9999zzzz", title: "Two", publishedAt: new Date("2026-11-19T10:00:00Z"), views: 12, likes: null },
    ]);
  });
  it("parses subscriber text", () => {
    expect(parseCount("1.23M subscribers")).toBe(1230000);
    expect(parseCount("45.6K subscribers")).toBe(45600);
    expect(parseCount("812 subscribers")).toBe(812);
    expect(parseCount("1,234 subscribers")).toBe(1234);
  });
});

describe("clip identity and platform", () => {
  it("normalises clip URLs", () => {
    expect(clipKey("https://www.youtube.com/watch?v=abc123&t=1")).toBe("abc123");
    expect(clipKey("https://youtu.be/abc123")).toBe("abc123");
    expect(clipKey("https://www.youtube.com/shorts/abc123")).toBe("abc123");
    expect(clipKey("https://www.tiktok.com/@x/video/7312345678901234567?lang=vi")).toBe("7312345678901234567");
    expect(clipKey("https://www.facebook.com/reel/123/")).toBe("facebook.com/reel/123");
  });
  it("detects the platform from a post URL", () => {
    expect(platformOf("https://vt.tiktok.com/ZS123/")).toBe("tiktok");
    expect(platformOf("https://www.facebook.com/x/videos/1")).toBe("facebook");
    expect(platformOf("https://fb.watch/abc")).toBe("facebook");
    expect(platformOf("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(platformOf("https://youtu.be/x")).toBe("youtube");
    expect(platformOf("https://example.com/x")).toBeNull();
  });
});

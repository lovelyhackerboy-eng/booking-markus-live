// YouTube without an API key: the channel page gives channelId, avatar and subscriber text; the public RSS feed gives
// the 15 most recent videos with views (media:statistics) and likes (media:starRating count). No comments/shares.
// Channel URLs come from the Sheet, so only https YouTube hosts are fetched, with a timeout and a body cap.
export type YtClip = { externalId: string; url: string; title: string; publishedAt: Date | null; views: number | null; likes: number | null };
export type YtChannel = { channelId: string; avatarUrl: string | null; subscribers: number | null; clips: YtClip[] };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const PAGE_HOSTS = /^(www\.|m\.)?youtube\.com$/;
const MAX_BYTES = 3_000_000;

type Fetcher = (url: string) => Promise<{ status: number; text: string }>;
let fetcher: Fetcher = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" }, signal: ctl.signal, redirect: "follow" });
    const final = new URL(r.url || url);
    if (final.protocol !== "https:" || !PAGE_HOSTS.test(final.hostname)) return { status: 0, text: "" };
    const reader = r.body?.getReader();
    if (!reader) return { status: r.status, text: "" };
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return { status: r.status, text: Buffer.concat(chunks).toString("utf8") };
  } finally {
    clearTimeout(t);
  }
};
export const setYoutubeFetcherForTests = (f: Fetcher) => { fetcher = f; };

export class FetchError extends Error {}

// First path segments that are YouTube pages, not a legacy custom channel URL (youtube.com/<name>).
const RESERVED = new Set(["watch", "results", "feed", "shorts", "playlist", "embed", "live", "channel", "c", "user", "hashtag", "premium",
  "gaming", "music", "kids", "account", "about", "t", "redirect", "signin", "logout", "upload", "studio", "s", "post", "source", "attribution_link", "v", "e", "clip"]);

/** Accepts channel URLs (/@handle, /channel/UC…, /c/…, /user/… and the legacy custom /<name>). Video URLs are refused. */
export function channelPageUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!PAGE_HOSTS.test(u.hostname)) return null;
  const legacy = u.pathname.match(/^\/([A-Za-z0-9._-]{2,100})(\/|$)/)?.[1];
  if (legacy && !RESERVED.has(legacy.toLowerCase()) && !legacy.includes(".")) return `https://www.youtube.com/${legacy}`;
  if (!/^\/(@[^/]+|channel\/UC[\w-]{22}|c\/[^/]+|user\/[^/]+)/.test(u.pathname)) return null;
  const path = u.pathname.split("/").slice(0, u.pathname.startsWith("/@") ? 2 : 3).join("/");
  return `https://www.youtube.com${path}`;
}

export function parseCount(text: string): number | null {
  const m = text.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  const v = Math.round(parseFloat(m[1]) * mult);
  return Number.isFinite(v) ? v : null;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function parseFeed(xml: string): YtClip[] {
  return xml
    .split("<entry>")
    .slice(1)
    .map((e) => {
      const id = e.match(/<yt:videoId>([\w-]{6,20})<\/yt:videoId>/)?.[1];
      if (!id) return null;
      const pub = e.match(/<published>([^<]+)<\/published>/)?.[1];
      const views = e.match(/<media:statistics views="(\d+)"/)?.[1];
      const likes = e.match(/<media:starRating count="(\d+)"/)?.[1];
      return {
        externalId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: decode(e.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").slice(0, 300),
        publishedAt: pub ? new Date(pub) : null,
        views: views != null ? +views : null,
        likes: likes != null ? +likes : null,
      };
    })
    .filter((x): x is YtClip => !!x);
}

export async function fetchYoutubeChannel(rawUrl: string): Promise<YtChannel> {
  const pageUrl = channelPageUrl(rawUrl);
  if (!pageUrl) throw new FetchError("not_a_channel_url");
  const page = await fetcher(pageUrl);
  if (page.status !== 200) throw new FetchError("page_" + page.status);
  const channelId =
    page.text.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    page.text.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    page.text.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!channelId) throw new FetchError("no_channel_id");
  const og = page.text.match(/<meta property="og:image" content="(https:\/\/yt3\.[a-z]+\.com\/[^"]+)"/)?.[1] ?? null;
  const subText =
    page.text.match(/"subscriberCountText":\{[^}]*?"simpleText":"([^"]+)"/)?.[1] ??
    page.text.match(/"content":"([\d.,]+[KMB]?) subscribers"/)?.[1] ??
    null;
  const feed = await fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (feed.status !== 200) throw new FetchError("rss_" + feed.status);
  return { channelId, avatarUrl: og ? decode(og) : null, subscribers: subText ? parseCount(subText) : null, clips: parseFeed(feed.text) };
}

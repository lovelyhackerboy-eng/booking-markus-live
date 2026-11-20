// DeepSeek chat client (same account and key as the PHP app: hosting/deepseek-key.txt, read by path at call time).
// deepseek-v4-flash first, deepseek-v4-pro as fallback — like PHP ai-chat.impl.php. "Thinking" is disabled: replies come
// back in ~1 s and the whole token budget goes to the answer.
import { readFileSync } from "node:fs";
import { fail } from "../http";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

const URL_ = "https://api.deepseek.com/chat/completions";
const MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"];

function apiKey(): string {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const path = process.env.DEEPSEEK_KEY_PATH;
  if (!path) return fail(503, "ai_not_configured");
  try {
    const k = readFileSync(path, "utf8").trim();
    return k || fail(503, "ai_not_configured");
  } catch {
    return fail(503, "ai_not_configured");
  }
}

export type Usage = { prompt: number; cacheHit: number; completion: number };
export const addUsage = (a: Usage, b: Usage): Usage => ({ prompt: a.prompt + b.prompt, cacheHit: a.cacheHit + b.cacheHit, completion: a.completion + b.completion });
export const NO_USAGE: Usage = { prompt: 0, cacheHit: 0, completion: 0 };

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...a) => fetch(...a);
export function setFetcherForTests(f: Fetcher | null) {
  fetcher = f ?? ((...a) => fetch(...a));
}

export async function chat(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ content: string | null; toolCalls: ToolCall[]; model: string; usage: Usage }> {
  const key = apiKey();
  let lastStatus = 0;
  for (const model of MODELS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 40_000);
    try {
      const res = await fetcher(URL_, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          thinking: { type: "disabled" },
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 1200,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          ...(opts.tools?.length ? { tools: opts.tools, tool_choice: "auto" } : {}),
        }),
        signal: ctl.signal,
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      const j = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
      };
      const m = j.choices?.[0]?.message;
      if (!m) continue;
      const u = j.usage ?? {};
      return {
        content: m.content ?? null,
        toolCalls: m.tool_calls ?? [],
        model: j.model ?? model,
        usage: { prompt: u.prompt_tokens ?? 0, cacheHit: u.prompt_cache_hit_tokens ?? 0, completion: u.completion_tokens ?? 0 },
      };
    } catch {
      lastStatus = lastStatus || 599;
    } finally {
      clearTimeout(timer);
    }
  }
  console.error("[mkv2] deepseek failed, last status", lastStatus);
  return fail(502, "ai_unavailable");
}

// Per-user rate limit (per Node process): AI calls cost money. Same order as PHP mk_rate_limit(…, 30, 60).
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) fail(429, "rate_limited");
  list.push(now);
  hits.set(key, list);
}

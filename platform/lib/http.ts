// Small HTTP helpers shared by route handlers. Error bodies carry a code only, never data.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export const fail = (status: number, code: string): never => {
  throw new HttpError(status, code);
};

const NO_STORE = { "cache-control": "no-store" };

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
  return Response.json(body, { ...init, headers });
}

// Wraps a handler: HttpError → JSON error; anything else → 500 without the message.
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.code }, { status: e.status });
      console.error("[mkv2] unhandled", (e as Error)?.name, (e as Error)?.message?.slice(0, 200));
      return json({ ok: false, error: "server_error" }, { status: 500 });
    }
  };
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); // ids are base64url: no decoding
  }
  return null;
}

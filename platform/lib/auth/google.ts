// Google ID token verification. Same checks as PHP mk_google_verify (public/_mk/auth.php):
// RS256 only, key by kid from Google's JWKS, issuer, audience = our client id, exp with 60 s leeway, verified email.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { fail } from "../http";

export type GoogleClaims = { email: string; name?: string; picture?: string };

let remote: JWTVerifyGetKey | null = null;
const googleKeys = (): JWTVerifyGetKey =>
  (remote ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { cacheMaxAge: 3_600_000 }));
// Tests replace Google's key set with a local one; production never calls this.
export function setGoogleKeysForTests(keys: JWTVerifyGetKey | null): void {
  remote = keys;
}

export async function verifyGoogleIdToken(
  token: unknown,
  opts: { audience: string; keys?: JWTVerifyGetKey },
): Promise<GoogleClaims> {
  if (!opts.audience) fail(500, "google_client_id_missing");
  if (typeof token !== "string" || token.length > 4096 || token.split(".").length !== 3) fail(401, "bad_token");
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token as string, opts.keys ?? googleKeys(), {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: opts.audience,
      clockTolerance: 60,
      requiredClaims: ["exp", "iat"],
    }));
  } catch {
    return fail(401, "bad_token");
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || payload.email_verified !== true) fail(401, "email_unverified");
  return {
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

// A local RSA key pair standing in for Google's signing keys.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

export async function fakeGoogle() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; expSec?: number } = {}) => {
    const iat = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setIssuer(opts.iss ?? "https://accounts.google.com")
      .setAudience(opts.aud ?? "test-client.apps.googleusercontent.com")
      .setIssuedAt(iat)
      .setExpirationTime(iat + (opts.expSec ?? 600))
      .sign(privateKey);
  };
  return { keys, sign, privateKey };
}

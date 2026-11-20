// LOCAL ONLY: create a session row for a seed user and print the cookie value, so the UI can be checked per role
// without Google sign-in. Refuses anything but a local, non-hosting database.
//   node scripts/dev-session.mjs ngocanh@markus.test     → prints mkv2_sid value
import { createHash, randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL || "";
const u = new URL(url);
if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname) || u.pathname.slice(1).startsWith("thestvco_") || process.env.NODE_ENV === "production") {
  console.error("refusing: local database only");
  process.exit(1);
}
const email = process.argv[2];
const id = randomBytes(32).toString("base64url");
const conn = await mysql.createConnection(url);
const [rows] = await conn.query("SELECT email FROM users WHERE email = ?", [email]);
if (!rows.length) { console.error("unknown seed user"); process.exit(1); }
await conn.query("INSERT INTO sessions (id_hash, email, csrf, created_at, last_seen_at) VALUES (?, ?, ?, NOW(3), NOW(3))", [
  createHash("sha256").update(id).digest("hex"), email, randomBytes(32).toString("hex"),
]);
await conn.end();
console.log(id);

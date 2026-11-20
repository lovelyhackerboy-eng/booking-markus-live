// Loads the prototype's FAKE data into a LOCAL database. Refuses to run against anything that looks like the host.
//   npm run db:seed
import { closeDb, db } from "../lib/db/client";
import { assertLocalDatabase, seedAll } from "../lib/db/seed-data";

async function main() {
  assertLocalDatabase(process.env.DATABASE_URL, process.env.NODE_ENV);
  const counts = await seedAll(db());
  console.log(JSON.stringify({ ok: true, ...counts }));
}

main()
  .catch((e) => {
    console.error("seed failed:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

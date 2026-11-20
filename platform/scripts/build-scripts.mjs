// Bundles the CLI scripts (migrate, seed) into self-contained dist/*.cjs files, so the host needs only node —
// the Next standalone output does not include drizzle's migrator or the seed data.
import { build } from "esbuild";

await build({
  entryPoints: { migrate: "scripts/migrate.ts", seed: "scripts/seed.ts", "import-sheet": "scripts/import-sheet.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  alias: { "@": "." },
  logLevel: "warning",
});
console.log("scripts built: dist/migrate.cjs dist/seed.cjs dist/import-sheet.cjs");

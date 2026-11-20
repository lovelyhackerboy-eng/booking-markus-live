import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only reads the schema; it never connects. Migrations are applied by dist/migrate.cjs.
export default defineConfig({
  dialect: "mysql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
});

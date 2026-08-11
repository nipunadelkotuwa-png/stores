import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/db/schema/index.ts",
  out: "./database/migrations/generated",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://store_user:store_password@localhost:5432/store_management",
  },
  strict: true,
  verbose: true,
});

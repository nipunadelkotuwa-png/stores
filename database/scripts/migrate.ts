import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const migrationDirectories = [
  path.join(root, "database/migrations/generated"),
  path.join(root, "database/migrations"),
];
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const directory of migrationDirectories) {
    const names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();

    for (const name of names) {
      const key = path
        .relative(root, path.join(directory, name))
        .replaceAll("\\", "/");
      const existing = await client.query(
        "SELECT 1 FROM app_migrations WHERE name = $1",
        [key],
      );
      if (existing.rowCount) continue;
      const sql = (
        await readFile(path.join(directory, name), "utf8")
      ).replaceAll("--> statement-breakpoint", "");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO app_migrations(name) VALUES ($1)", [
          key,
        ]);
        await client.query("COMMIT");
        console.log(`Applied ${key}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} finally {
  await client.end();
}

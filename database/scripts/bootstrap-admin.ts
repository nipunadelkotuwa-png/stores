import { Client } from "pg";
import { z } from "zod";

import { hashPassword } from "../../app/lib/auth/password.server";

const emailArg = process.argv.indexOf("--email");
const nameArg = process.argv.indexOf("--name");
const email =
  emailArg >= 0 ? process.argv[emailArg + 1]?.trim().toLowerCase() : undefined;
const name = nameArg >= 0 ? process.argv[nameArg + 1]?.trim() : undefined;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const url = process.env.DATABASE_URL;

if (!url) throw new Error("DATABASE_URL is required");
if (!email || !name) {
  throw new Error(
    "Usage: pnpm db:bootstrap-admin -- --email <email> --name <name>",
  );
}
if (!z.string().email().safeParse(email).success) {
  throw new Error("Email must be a valid email address");
}
if (!password || password.length < 12) {
  throw new Error("Set BOOTSTRAP_ADMIN_PASSWORD to at least 12 characters");
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  const count = await client.query(
    "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN'",
  );
  if (count.rows[0].count > 0) throw new Error("An Admin already exists");
  await client.query(
    `INSERT INTO users (email, display_name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'ADMIN', true)`,
    [email, name, await hashPassword(password)],
  );
  console.log(`Bootstrap Admin created for ${email}`);
} finally {
  await client.end();
}

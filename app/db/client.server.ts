import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "~/config/env.server";
import * as schema from "~/db/schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: getEnv().NODE_ENV === "production" ? 20 : 5,
  });

if (getEnv().NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });

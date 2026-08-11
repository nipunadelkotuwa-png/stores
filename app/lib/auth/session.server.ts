import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { createCookie } from "react-router";

import { getEnv } from "~/config/env.server";
import { db } from "~/db/client.server";
import { sessions, users } from "~/db/schema";

const COOKIE_NAME = "ds_store_session";
const ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;

function sessionCookie() {
  const env = getEnv();
  return createCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    secrets: [env.SESSION_COOKIE_SECRET],
    maxAge: ABSOLUTE_TTL_MS / 1000,
  });
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(userId: string, redirectTo = "/") {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: tokenHash(token),
    userId,
    csrfSecret: randomBytes(32).toString("base64url"),
    expiresAt,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectTo,
      "Set-Cookie": await sessionCookie().serialize(token),
    },
  });
}

export async function getSessionRecord(request: Request) {
  const token = await sessionCookie().parse(request.headers.get("Cookie"));
  if (typeof token !== "string") return null;
  const [record] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!record) return null;

  // Touch last-seen without blocking the request path on failure.
  void db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.id, record.session.id))
    .catch(() => undefined);

  return record;
}

export async function destroyUserSession(request: Request) {
  const token = await sessionCookie().parse(request.headers.get("Cookie"));
  if (typeof token === "string") {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash(token)));
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/login",
      "Set-Cookie": await sessionCookie().serialize("", { maxAge: 0 }),
    },
  });
}

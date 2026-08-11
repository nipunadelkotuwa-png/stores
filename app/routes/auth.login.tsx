import { eq } from "drizzle-orm";
import {
  Form,
  redirect,
  useActionData,
  useLocation,
  useNavigation,
} from "react-router";
import { z } from "zod";

import { db } from "~/db/client.server";
import { users } from "~/db/schema";
import {
  assertLoginAllowed,
  clearLoginFailures,
  getClientIp,
  recordLoginFailure,
} from "~/lib/auth/login-rate-limit.server";
import { verifyPassword } from "~/lib/auth/password.server";
import { createUserSession, getSessionRecord } from "~/lib/auth/session.server";
import type { Route } from "./+types/auth.login";

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1),
  redirectTo: z.string().default("/"),
});

export async function loader({ request }: Route.LoaderArgs) {
  if (await getSessionRecord(request)) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const ip = getClientIp(request);
  const locked = assertLoginAllowed(ip, parsed.data.email);
  if (locked) return { error: locked };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (
    !user ||
    user.status !== "ACTIVE" ||
    !(await verifyPassword(user.passwordHash, parsed.data.password))
  ) {
    recordLoginFailure(ip, parsed.data.email);
    return { error: "Email or password is incorrect." };
  }
  clearLoginFailures(ip, parsed.data.email);
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  const redirectTo =
    parsed.data.redirectTo.startsWith("/") &&
    !parsed.data.redirectTo.startsWith("//")
      ? parsed.data.redirectTo
      : "/";
  return createUserSession(user.id, redirectTo);
}

export default function Login() {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const location = useLocation();
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">DG</div>
        <p className="eyebrow">DS Gunasekara Group</p>
        <h1>Store Management</h1>
        <p className="muted">
          Sign in to manage spare-parts inventory across your assigned stores.
        </p>
        <Form method="post" className="stack-lg">
          <input
            type="hidden"
            name="redirectTo"
            value={
              new URLSearchParams(location.search).get("redirectTo") ?? "/"
            }
          />
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          {data?.error ? <p className="form-error">{data.error}</p> : null}
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "submitting" ? "Signing in…" : "Sign in"}
          </button>
        </Form>
      </section>
    </main>
  );
}

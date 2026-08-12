import { eq } from "drizzle-orm";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";

import { db } from "~/db/client.server";
import { users } from "~/db/schema";
import { hashPassword, verifyPassword } from "~/lib/auth/password.server";
import { getSessionRecord } from "~/lib/auth/session.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/auth.change-password";

const schema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
  });

export async function loader({ request }: Route.LoaderArgs) {
  const record = await getSessionRecord(request);
  if (!record) throw redirect("/login");
  return { csrf: record.session.csrfSecret };
}

export async function action({ request }: Route.ActionArgs) {
  const record = await getSessionRecord(request);
  if (!record) throw redirect("/login");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };

  if (await verifyPassword(record.user.passwordHash, parsed.data.password)) {
    return { error: "Choose a password different from your current one." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    })
    .where(eq(users.id, record.user.id));
  throw redirect("/");
}

export default function ChangePassword({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Security required</p>
        <h1>Change password</h1>
        <p className="muted">
          Choose a password with at least 12 characters before continuing.
        </p>
        <Form method="post" className="stack-lg">
          <input type="hidden" name="csrf" value={loaderData.csrf} />
          <label>
            New password
            <input type="password" name="password" required />
          </label>
          <label>
            Confirm password
            <input type="password" name="confirmPassword" required />
          </label>
          {data?.error ? <p className="form-error">{data.error}</p> : null}
          <button
            type="submit"
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "submitting"
              ? "Updating..."
              : "Update password"}
          </button>
        </Form>
      </section>
    </main>
  );
}

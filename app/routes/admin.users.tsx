import { Form, useActionData } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { userStoreAssignments, users } from "~/db/schema";
import {
  listStores,
  listUserAssignments,
  listUsers,
} from "~/features/master-data/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import { hashPassword } from "~/lib/auth/password.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/admin.users";
const createSchema = z
  .object({
    intent: z.literal("create"),
    email: z.string().email(),
    displayName: z.string().min(1),
    role: z.enum(["ADMIN", "OPERATOR"]),
    password: z.string().min(12),
    storeId: z.string().uuid().optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.role === "OPERATOR" && !value.storeId) {
      ctx.addIssue({
        code: "custom",
        message: "Operators require an assigned store",
        path: ["storeId"],
      });
    }
  });
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [userRows, stores, assignments] = await Promise.all([
    listUsers(),
    listStores(),
    listUserAssignments(),
  ]);
  return {
    users: userRows.map((user) => ({
      ...user,
      stores: assignments
        .filter((a) => a.userId === user.id)
        .map((a) => a.storeName),
    })),
    stores,
  };
}
export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid user" };
  const { email, displayName, role, password, storeId } = parsed.data;
  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      displayName,
      role,
      passwordHash: await hashPassword(password),
    })
    .returning({ id: users.id });
  if (role === "OPERATOR" && storeId)
    await db
      .insert(userStoreAssignments)
      .values({ userId: created.id, storeId, assignedBy: actor.id });
  return { ok: true };
}
export default function UsersPage({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Users and access</h1>
          <p className="muted">
            Operators are constrained to assigned store locations.
          </p>
        </div>
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Stores</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.displayName}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      <span className="badge">{user.role}</span>
                    </td>
                    <td>
                      {user.role === "ADMIN"
                        ? "All stores"
                        : user.stores.join(", ") || "None"}
                    </td>
                    <td>
                      <span className="badge success">{user.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel form-panel">
          <h2>Create user</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="create" />
            <label>
              Name
              <input name="displayName" required />
            </label>
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option value="OPERATOR">Operator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label>
              Assigned store (required for Operators)
              <select name="storeId">
                <option value="">Select store</option>
                {loaderData.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} — {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Temporary password
              <input type="password" name="password" minLength={12} required />
            </label>
            {data?.error ? <p className="form-error">{data.error}</p> : null}
            <button className="button button-primary">Create user</button>
          </Form>
        </section>
      </div>
    </>
  );
}

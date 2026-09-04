import { and, eq, ne } from "drizzle-orm";
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
import { revokeUserSessions } from "~/lib/auth/session.server";
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

const userIdSchema = z.string().uuid();

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
        .filter((assignment) => assignment.userId === user.id)
        .map((assignment) => ({
          id: assignment.storeId,
          name: assignment.storeName,
        })),
    })),
    stores,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "create");

  try {
    if (intent === "create") {
      const parsed = createSchema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Invalid user" };
      }
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
      if (role === "OPERATOR" && storeId) {
        await db
          .insert(userStoreAssignments)
          .values({ userId: created.id, storeId, assignedBy: actor.id });
      }
      return { ok: true };
    }

    const userId = userIdSchema.safeParse(formData.get("userId"));
    if (!userId.success) return { error: "Invalid user." };
    if (userId.data === actor.id && intent !== "add-store") {
      if (intent === "disable" || intent === "change-role") {
        return { error: "You cannot change your own role or disable yourself." };
      }
    }

    const [target] = await db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId.data))
      .limit(1);
    if (!target) return { error: "User not found." };

    if (intent === "disable" || intent === "enable") {
      if (target.id === actor.id) {
        return { error: "You cannot disable your own account." };
      }
      const status = intent === "disable" ? "DISABLED" : "ACTIVE";
      await db.update(users).set({ status }).where(eq(users.id, target.id));
      if (status === "DISABLED") await revokeUserSessions(target.id);
      return { ok: true };
    }

    if (intent === "reset-password") {
      const password = String(formData.get("password") ?? "");
      if (password.length < 12) {
        return { error: "Temporary password must be at least 12 characters." };
      }
      await db
        .update(users)
        .set({
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        })
        .where(eq(users.id, target.id));
      await revokeUserSessions(target.id);
      return { ok: true };
    }

    if (intent === "change-role") {
      if (target.id === actor.id) {
        return { error: "You cannot change your own role." };
      }
      const role = z.enum(["ADMIN", "OPERATOR"]).safeParse(formData.get("role"));
      if (!role.success) return { error: "Invalid role." };
      if (role.data === "OPERATOR") {
        const [assignment] = await db
          .select({ storeId: userStoreAssignments.storeId })
          .from(userStoreAssignments)
          .where(eq(userStoreAssignments.userId, target.id))
          .limit(1);
        if (!assignment) {
          return {
            error: "Assign a store before changing this user to operator.",
          };
        }
      }
      await db
        .update(users)
        .set({ role: role.data })
        .where(eq(users.id, target.id));
      return { ok: true };
    }

    if (intent === "add-store") {
      const storeId = z.string().uuid().safeParse(formData.get("storeId"));
      if (!storeId.success) return { error: "Select a store." };
      await db
        .insert(userStoreAssignments)
        .values({
          userId: target.id,
          storeId: storeId.data,
          assignedBy: actor.id,
        })
        .onConflictDoNothing();
      return { ok: true };
    }

    if (intent === "remove-store") {
      const storeId = z.string().uuid().safeParse(formData.get("storeId"));
      if (!storeId.success) return { error: "Invalid store." };
      if (target.role === "OPERATOR") {
        const remaining = await db
          .select({ storeId: userStoreAssignments.storeId })
          .from(userStoreAssignments)
          .where(
            and(
              eq(userStoreAssignments.userId, target.id),
              ne(userStoreAssignments.storeId, storeId.data),
            ),
          );
        if (remaining.length === 0) {
          return { error: "Operators must keep at least one assigned store." };
        }
      }
      await db
        .delete(userStoreAssignments)
        .where(
          and(
            eq(userStoreAssignments.userId, target.id),
            eq(userStoreAssignments.storeId, storeId.data),
          ),
        );
      return { ok: true };
    }

    return { error: "Unknown action." };
  } catch (error) {
    const message =
      error instanceof Error && /unique|duplicate/i.test(error.message)
        ? "That email or store assignment already exists."
        : "Unable to update user.";
    return { error: message };
  }
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
            Operators are constrained to assigned store locations. Disable an
            account or reset a password without rewriting history.
          </p>
        </div>
      </div>
      {data?.error ? <p className="form-error">{data.error}</p> : null}
      {data && "ok" in data && data.ok ? <p className="muted">Saved.</p> : null}
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
                  <th />
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
                      <Form method="post" className="stack" style={{ gap: "0.35rem" }}>
                        <CsrfField />
                        <input type="hidden" name="intent" value="change-role" />
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="role" defaultValue={user.role}>
                          <option value="OPERATOR">Operator</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button className="text-button" type="submit">
                          Save role
                        </button>
                      </Form>
                    </td>
                    <td>
                      {user.role === "ADMIN" ? (
                        <span>All stores</span>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                          {user.stores.length === 0 ? (
                            <li>None</li>
                          ) : (
                            user.stores.map((store) => (
                              <li key={store.id}>
                                {store.name}{" "}
                                <Form
                                  method="post"
                                  style={{ display: "inline" }}
                                >
                                  <CsrfField />
                                  <input
                                    type="hidden"
                                    name="intent"
                                    value="remove-store"
                                  />
                                  <input
                                    type="hidden"
                                    name="userId"
                                    value={user.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="storeId"
                                    value={store.id}
                                  />
                                  <button className="text-button" type="submit">
                                    Remove
                                  </button>
                                </Form>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                      <Form
                        method="post"
                        style={{
                          display: "flex",
                          gap: "0.35rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <CsrfField />
                        <input type="hidden" name="intent" value="add-store" />
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="storeId" aria-label={`Add store for ${user.displayName}`}>
                          <option value="">Add store</option>
                          {loaderData.stores
                            .filter(
                              (store) =>
                                !user.stores.some((assigned) => assigned.id === store.id),
                            )
                            .map((store) => (
                              <option key={store.id} value={store.id}>
                                {store.code} — {store.name}
                              </option>
                            ))}
                        </select>
                        <button className="text-button" type="submit">
                          Add
                        </button>
                      </Form>
                    </td>
                    <td>
                      <span
                        className={`badge ${user.status === "ACTIVE" ? "success" : ""}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: "0.5rem" }}>
                        <Form method="post">
                          <CsrfField />
                          <input
                            type="hidden"
                            name="intent"
                            value={user.status === "ACTIVE" ? "disable" : "enable"}
                          />
                          <input type="hidden" name="userId" value={user.id} />
                          <button className="text-button" type="submit">
                            {user.status === "ACTIVE" ? "Disable" : "Enable"}
                          </button>
                        </Form>
                        <Form method="post" className="stack" style={{ gap: "0.35rem" }}>
                          <CsrfField />
                          <input
                            type="hidden"
                            name="intent"
                            value="reset-password"
                          />
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="password"
                            name="password"
                            minLength={12}
                            placeholder="New temp password"
                            required
                            aria-label={`Temporary password for ${user.displayName}`}
                          />
                          <button className="text-button" type="submit">
                            Reset password
                          </button>
                        </Form>
                      </div>
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
            <button className="button button-primary">Create user</button>
          </Form>
        </section>
      </div>
    </>
  );
}

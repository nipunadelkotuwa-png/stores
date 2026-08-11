import { eq } from "drizzle-orm";
import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { stores } from "~/db/schema";
import { masterDataActionError } from "~/features/master-data/errors";
import { listStores } from "~/features/master-data/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/admin.stores";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { stores: await listStores() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "toggle") {
    const id = String(formData.get("id") ?? "");
    const active = formData.get("active") === "true";
    if (!z.string().uuid().safeParse(id).success) {
      return { error: "Invalid store." };
    }
    await db.update(stores).set({ active: !active }).where(eq(stores.id, id));
    return { ok: true };
  }

  const parsed = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Code and name are required." };
  try {
    await db.insert(stores).values({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
    });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A store with that code already exists.",
        "Unable to add store.",
      ),
    };
  }
}

export default function StoresPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Store locations</h1>
          <p className="muted">
            Inventory balances and Operator access are separated by location.
          </p>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Store</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loaderData.stores.map((store) => (
                  <tr key={store.id}>
                    <td className="mono">{store.code}</td>
                    <td>
                      <strong>{store.name}</strong>
                    </td>
                    <td>{store.address ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${store.active ? "success" : ""}`}
                      >
                        {store.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Form method="post">
                        <CsrfField />
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={store.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(store.active)}
                        />
                        <button className="text-button" type="submit">
                          {store.active ? "Deactivate" : "Activate"}
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel form-panel">
          <h2>Add store</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="create" />
            <label>
              Code
              <input name="code" required />
            </label>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Address
              <textarea name="address" />
            </label>
            <label>
              Phone
              <input name="phone" />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Add store
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}

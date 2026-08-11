import { eq } from "drizzle-orm";
import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { suppliers } from "~/db/schema";
import { masterDataActionError } from "~/features/master-data/errors";
import { listSuppliers } from "~/features/master-data/queries.server";
import { requireAdmin, requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.suppliers";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return { suppliers: await listSuppliers() };
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
      return { error: "Invalid supplier." };
    }
    await db
      .update(suppliers)
      .set({ active: !active })
      .where(eq(suppliers.id, id));
    return { ok: true };
  }

  const parsed = z
    .object({
      code: z.string().min(1),
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Code and name are required." };
  try {
    await db.insert(suppliers).values({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
    });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A supplier with that code already exists.",
        "Unable to add supplier.",
      ),
    };
  }
}

export default function SuppliersPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Purchasing</p>
          <h1>Suppliers</h1>
          <p className="muted">
            Approved and local suppliers used by stock receipts and purchases.
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
                  <th>Supplier</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loaderData.suppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td className="mono">{supplier.code}</td>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{supplier.phone ?? "—"}</td>
                    <td>{supplier.email ?? "—"}</td>
                    <td>
                      <span
                        className={`badge ${supplier.active ? "success" : ""}`}
                      >
                        {supplier.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Form method="post">
                        <CsrfField />
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={supplier.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(supplier.active)}
                        />
                        <button className="text-button" type="submit">
                          {supplier.active ? "Deactivate" : "Activate"}
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
          <h2>Add supplier</h2>
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
              Phone
              <input name="phone" />
            </label>
            <label>
              Email
              <input name="email" type="email" />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Add supplier
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}

import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { parts } from "~/db/schema";
import { masterDataActionError } from "~/features/master-data/errors";
import { listParts } from "~/features/master-data/queries.server";
import { requireAdmin, requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/app.parts";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return { parts: await listParts() };
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
      return { error: "Invalid part." };
    }
    await db.update(parts).set({ active: !active }).where(eq(parts.id, id));
    return { ok: true };
  }

  const parsed = z
    .object({
      sku: z.string().min(1),
      name: z.string().min(1),
      unit: z.string().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "SKU, name, and unit are required." };
  try {
    await db
      .insert(parts)
      .values({ ...parsed.data, sku: parsed.data.sku.toUpperCase() });
    return { ok: true };
  } catch (error) {
    return {
      error: masterDataActionError(
        error,
        "A part with that SKU already exists.",
        "Unable to add part.",
      ),
    };
  }
}

export default function PartsPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Master data</p>
          <h1>Spare parts</h1>
          <p className="muted">
            Part catalogue used across receipts, issues, purchases, and reports.
          </p>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="muted">Saved.</p>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <h2>Part catalogue</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Part</th>
                  <th>Unit</th>
                  <th>Brand</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loaderData.parts.map((part) => (
                  <tr key={part.id}>
                    <td className="mono">{part.sku}</td>
                    <td>
                      <strong>{part.name}</strong>
                      <small>{part.category ?? "Uncategorized"}</small>
                    </td>
                    <td>{part.unit}</td>
                    <td>{part.brand ?? "—"}</td>
                    <td>
                      <span className={`badge ${part.active ? "success" : ""}`}>
                        {part.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <Form method="post">
                        <CsrfField />
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={part.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(part.active)}
                        />
                        <button className="text-button" type="submit">
                          {part.active ? "Deactivate" : "Activate"}
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
          <h2>Add spare part</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="create" />
            <label>
              SKU
              <input name="sku" required />
            </label>
            <label>
              Part name
              <input name="name" required />
            </label>
            <label>
              Unit
              <input name="unit" defaultValue="EA" required />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Add part
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}

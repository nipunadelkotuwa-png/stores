import { asc, eq } from "drizzle-orm";
import { Form, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { db } from "~/db/client.server";
import { parts, storePartSettings, stores } from "~/db/schema";
import { requireAdmin } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/admin.reorder";

const schema = z.object({
  storeId: z.string().uuid(),
  partId: z.string().uuid(),
  reorderLevel: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, "Reorder level must be a non-negative decimal"),
  binLocation: z.string().max(100).optional(),
});

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const [storeRows, partRows, settings] = await Promise.all([
    db
      .select()
      .from(stores)
      .where(eq(stores.active, true))
      .orderBy(asc(stores.code)),
    db
      .select()
      .from(parts)
      .where(eq(parts.active, true))
      .orderBy(asc(parts.sku)),
    db
      .select({
        storeId: storePartSettings.storeId,
        partId: storePartSettings.partId,
        storeCode: stores.code,
        storeName: stores.name,
        sku: parts.sku,
        partName: parts.name,
        reorderLevel: storePartSettings.reorderLevel,
        binLocation: storePartSettings.binLocation,
      })
      .from(storePartSettings)
      .innerJoin(stores, eq(storePartSettings.storeId, stores.id))
      .innerJoin(parts, eq(storePartSettings.partId, parts.id))
      .orderBy(asc(stores.code), asc(parts.sku)),
  ]);
  return { stores: storeRows, parts: partRows, settings };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid reorder settings.",
    };
  }
  await db
    .insert(storePartSettings)
    .values({
      storeId: parsed.data.storeId,
      partId: parsed.data.partId,
      reorderLevel: parsed.data.reorderLevel,
      binLocation: parsed.data.binLocation || null,
      active: true,
    })
    .onConflictDoUpdate({
      target: [storePartSettings.storeId, storePartSettings.partId],
      set: {
        reorderLevel: parsed.data.reorderLevel,
        binLocation: parsed.data.binLocation || null,
        active: true,
      },
    });
  return { ok: true };
}

export default function ReorderPage({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Reorder levels</h1>
          <p className="muted">
            Per-store thresholds that drive the low-stock alert list.
          </p>
        </div>
      </div>
      {data?.error ? <p className="form-error">{data.error}</p> : null}
      {data && "ok" in data && data.ok ? (
        <p className="muted">Reorder setting saved.</p>
      ) : null}
      <div className="two-column">
        <section className="panel">
          <h2>Configured levels</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Part</th>
                  <th>Reorder at</th>
                  <th>Bin</th>
                </tr>
              </thead>
              <tbody>
                {loaderData.settings.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No reorder settings yet.</td>
                  </tr>
                ) : (
                  loaderData.settings.map((row) => (
                    <tr key={`${row.storeId}-${row.partId}`}>
                      <td>
                        {row.storeCode} — {row.storeName}
                      </td>
                      <td>
                        <strong>{row.sku}</strong>
                        <small>{row.partName}</small>
                      </td>
                      <td className="quantity">{row.reorderLevel}</td>
                      <td>{row.binLocation ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel form-panel">
          <h2>Set / update level</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <label>
              Store
              <select name="storeId" required>
                <option value="">Select store</option>
                {loaderData.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} — {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Part
              <select name="partId" required>
                <option value="">Select part</option>
                {loaderData.parts.map((part) => (
                  <option key={part.id} value={part.id}>
                    {part.sku} — {part.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reorder level
              <input
                name="reorderLevel"
                type="number"
                min="0"
                step="0.001"
                required
              />
            </label>
            <label>
              Bin location
              <input name="binLocation" />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Save setting
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}

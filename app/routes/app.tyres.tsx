import { useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { BUSINESS_DAG_STAGES } from "~/features/workshop/constants";
import { workshopActionError } from "~/features/workshop/errors";
import {
  getJobCardFormOptions,
  getTyreRegisterCounts,
  listCategoryParts,
  listTyres,
} from "~/features/workshop/queries.server";
import { statusLabel } from "~/features/workshop/tyre-lifecycle";
import { registerTyre, disposeTyre } from "~/features/workshop/tyres.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const filters = {
    status: url.searchParams.get("status") || undefined,
    serial: url.searchParams.get("serial") || undefined,
    stage: url.searchParams.get("stage") || undefined,
    storeId: url.searchParams.get("store") || undefined,
    busId: url.searchParams.get("bus") || undefined,
    sku: url.searchParams.get("sku") || undefined,
  };
  const [tyreRows, tyreParts, formOptions, counts] = await Promise.all([
    listTyres(actor, filters),
    listCategoryParts("TYRE"),
    getJobCardFormOptions(actor),
    getTyreRegisterCounts(actor),
  ]);
  return {
    tyres: tyreRows,
    tyreParts,
    stores: formOptions.stores,
    buses: formOptions.buses,
    counts,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "register");
  try {
    if (intent === "dispose") {
      await disposeTyre(actor, Object.fromEntries(formData));
      return { ok: true, disposed: true };
    }
    await registerTyre(actor, Object.fromEntries(formData));
    return { ok: true };
  } catch (error) {
    return {
      error: workshopActionError(
        error,
        intent === "dispose"
          ? "Unable to dispose tyre"
          : "Unable to register tyre",
      ),
    };
  }
}

function counterHref(
  params: URLSearchParams,
  patch: Record<string, string | null>,
) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `/tyres?${qs}` : "/tyres";
}

export default function TyresPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [key] = useState(0);
  const { counts } = loaderData;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>Tyres</h1>
          <p className="muted">
            Register serials against warehouse tyre stock, then fit them from a
            job card. Lifecycle stages are ORG → DAG1 → DAG2 → DAG3.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres/dag">
            DAG send / return
          </Link>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: "1rem" }}>
        Stage chips count warehouse + on-bus only. At DAG and Disposed are
        separate.
      </p>

      <div
        className="heading-actions"
        style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}
      >
        {(
          [
            ["TOTAL ACTIVE", counts.totalActive, { status: null, stage: null }],
            ["ORG", counts.ORG, { stage: "ORG", status: null }],
            ["DAG1", counts.DAG1, { stage: "DAG1", status: null }],
            ["DAG2", counts.DAG2, { stage: "DAG2", status: null }],
            ["DAG3", counts.DAG3, { stage: "DAG3", status: null }],
            ["AT DAG", counts.atDag, { status: "AT_DAG", stage: null }],
            ["DISPOSED", counts.disposed, { status: "DISPOSED", stage: null }],
          ] as const
        ).map(([label, value, patch]) => (
          <Link
            key={label}
            className="button button-secondary"
            to={counterHref(params, patch)}
          >
            {label}: {value}
          </Link>
        ))}
      </div>

      <div className="two-column">
        <section className="panel">
          <Form
            className="form-grid"
            style={{
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto",
              alignItems: "end",
              marginBottom: "1rem",
            }}
          >
            <label>
              Serial
              <input
                name="serial"
                defaultValue={params.get("serial") || ""}
                placeholder="Search serial"
              />
            </label>
            <label>
              Stage
              <select name="stage" defaultValue={params.get("stage") || ""}>
                <option value="">All</option>
                {BUSINESS_DAG_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={params.get("status") || ""}>
                <option value="">All</option>
                <option value="IN_STORE">Warehouse</option>
                <option value="FITTED">On bus</option>
                <option value="AT_DAG">At DAG</option>
                <option value="IN_TRANSIT">In transit</option>
                <option value="DISPOSED">Disposed</option>
                <option value="SCRAPPED">Scrapped</option>
              </select>
            </label>
            <label>
              Store
              <select name="store" defaultValue={params.get("store") || ""}>
                <option value="">All</option>
                {loaderData.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              SKU
              <input
                name="sku"
                defaultValue={params.get("sku") || ""}
                placeholder="SKU"
              />
            </label>
            <button className="button button-secondary" type="submit">
              Filter
            </button>
          </Form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>SKU</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loaderData.tyres.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <strong>No tyres registered</strong>
                        <p>Receive tyre stock, then register each serial.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  loaderData.tyres.map((tyre) => (
                    <tr key={tyre.id}>
                      <td className="mono">
                        <Link to={`/tyres/${tyre.id}`}>{tyre.serialNumber}</Link>
                      </td>
                      <td className="mono">{tyre.sku}</td>
                      <td>{tyre.stage}</td>
                      <td>
                        <span className="badge">
                          {statusLabel(tyre.status)}
                        </span>
                      </td>
                      <td>
                        {tyre.status === "FITTED"
                          ? `${tyre.fleetNumber ?? "Bus"} · ${tyre.position}`
                          : tyre.status === "IN_STORE"
                            ? `Warehouse · ${tyre.store ?? "—"}`
                            : (tyre.store ?? "—")}
                      </td>
                      <td>
                        {tyre.status === "IN_STORE" ? (
                          <Form method="post">
                            <CsrfField />
                            <input
                              type="hidden"
                              name="intent"
                              value="dispose"
                            />
                            <input
                              type="hidden"
                              name="tyreId"
                              value={tyre.id}
                            />
                            <input
                              type="hidden"
                              name="businessDate"
                              value={new Date().toISOString().slice(0, 10)}
                            />
                            <input
                              type="hidden"
                              name="idempotencyKey"
                              value={`dispose-${tyre.id}`}
                            />
                            <button className="text-button" type="submit">
                              Dispose
                            </button>
                          </Form>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel form-panel">
          <h2>Register serial</h2>
          {loaderData.tyreParts.length === 0 ? (
            <p className="muted">Create a TYRE category and tyre SKUs first.</p>
          ) : (
            <Form
              method="post"
              className="stack"
              key={key + String(actionData?.ok)}
            >
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
                Tyre SKU
                <select name="partId" required>
                  <option value="">Select SKU</option>
                  {loaderData.tyreParts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.sku} — {part.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Serial number
                <input name="serialNumber" required minLength={2} />
              </label>
              <label>
                Stage
                <select name="lifecycleStage" defaultValue="ORG">
                  {BUSINESS_DAG_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              {actionData?.error ? (
                <p className="form-error">{actionData.error}</p>
              ) : null}
              {actionData?.ok &&
              "disposed" in actionData &&
              actionData.disposed ? (
                <p className="muted">Tyre disposed.</p>
              ) : null}
              {actionData?.ok &&
              !("disposed" in actionData && actionData.disposed) ? (
                <p className="muted">Serial registered.</p>
              ) : null}
              <button
                className="button button-primary"
                disabled={navigation.state !== "idle"}
              >
                Register tyre
              </button>
            </Form>
          )}
        </section>
      </div>
    </>
  );
}

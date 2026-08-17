import { useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { TYRE_STAGES } from "~/features/workshop/constants";
import { workshopActionError } from "~/features/workshop/errors";
import {
  getJobCardFormOptions,
  listCategoryParts,
  listTyres,
} from "~/features/workshop/queries.server";
import { registerTyre } from "~/features/workshop/tyres.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const [tyreRows, tyreParts, formOptions] = await Promise.all([
    listTyres(actor, {
      status: url.searchParams.get("status") || undefined,
      serial: url.searchParams.get("serial") || undefined,
    }),
    listCategoryParts("TYRE"),
    getJobCardFormOptions(actor),
  ]);
  return { tyres: tyreRows, tyreParts, stores: formOptions.stores };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  try {
    await registerTyre(actor, Object.fromEntries(formData));
    return { ok: true };
  } catch (error) {
    return { error: workshopActionError(error, "Unable to register tyre") };
  }
}

export default function TyresPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [key] = useState(0);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>Tyres</h1>
          <p className="muted">
            Register serials against on-hand tyre stock, then fit them from a
            job card. DAG send/receive is a separate step.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres/dag">
            DAG send / receive
          </Link>
        </div>
      </div>

      <div className="two-column">
        <section className="panel">
          <Form
            className="form-grid"
            style={{
              gridTemplateColumns: "1fr 1fr auto",
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
              Status
              <select name="status" defaultValue={params.get("status") || ""}>
                <option value="">All</option>
                <option value="IN_STORE">In store</option>
                <option value="FITTED">Fitted</option>
                <option value="AT_DAG">At DAG</option>
                <option value="SCRAPPED">Scrapped</option>
              </select>
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
                </tr>
              </thead>
              <tbody>
                {loaderData.tyres.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <strong>No tyres registered</strong>
                        <p>Receive tyre stock, then register each serial.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  loaderData.tyres.map((tyre) => (
                    <tr key={tyre.id}>
                      <td className="mono">{tyre.serialNumber}</td>
                      <td className="mono">{tyre.sku}</td>
                      <td>{tyre.stage}</td>
                      <td>
                        <span className="badge">
                          {tyre.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        {tyre.status === "FITTED"
                          ? `${tyre.fleetNumber ?? "Bus"} · ${tyre.position}`
                          : (tyre.store ?? "—")}
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
                  {TYRE_STAGES.filter((stage) => stage !== "SCRAP").map(
                    (stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              {actionData?.error ? (
                <p className="form-error">{actionData.error}</p>
              ) : null}
              {actionData?.ok ? (
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

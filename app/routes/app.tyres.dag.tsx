import { useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { USABLE_TYRE_STAGES } from "~/features/workshop/constants";
import { skuMatchesLifecycleStage } from "~/features/workshop/tyre-lifecycle";
import { workshopActionError } from "~/features/workshop/errors";
import {
  listCategoryParts,
  listInStoreTyres,
  listTyresAtDag,
} from "~/features/workshop/queries.server";
import {
  receiveTyreFromDag,
  sendTyreToDag,
} from "~/features/workshop/tyres.server";
import { listSuppliers } from "~/features/master-data/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres.dag";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const [inStore, atDag, tyreParts, suppliers] = await Promise.all([
    listInStoreTyres(actor),
    listTyresAtDag(actor),
    listCategoryParts("TYRE"),
    listSuppliers(),
  ]);
  return {
    inStore,
    atDag,
    tyreParts,
    suppliers: suppliers.filter((row) => row.active),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "send") {
      await sendTyreToDag(actor, Object.fromEntries(formData));
      return { ok: "sent" as const };
    }
    if (intent === "receive") {
      await receiveTyreFromDag(actor, Object.fromEntries(formData));
      return { ok: "received" as const };
    }
    return { error: "Unknown action" };
  } catch (error) {
    return { error: workshopActionError(error, "Unable to update DAG tyre") };
  }
}

export default function TyreDagPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [sendKey] = useState(() => crypto.randomUUID());
  const [receiveKey] = useState(() => crypto.randomUUID());
  const [toStage, setToStage] =
    useState<(typeof USABLE_TYRE_STAGES)[number]>("DAG1");
  const busy = navigation.state !== "idle";
  const today = new Date().toISOString().slice(0, 10);
  const stageParts = loaderData.tyreParts.filter((part) =>
    skuMatchesLifecycleStage(part.sku, toStage),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>DAG send / return</h1>
          <p className="muted">
            Send a store serial to a retread supplier. On return, choose the
            resulting stage (ORG, DAG1–3, or REBUILD) and matching SKU.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres">
            Tyre register
          </Link>
          <Link className="button button-secondary" to="/reports/dag-out">
            DAG out summary
          </Link>
        </div>
      </div>

      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData?.ok === "sent" ? (
        <p className="muted">Tyre sent to DAG.</p>
      ) : null}
      {actionData?.ok === "received" ? (
        <p className="muted">Tyre returned from DAG.</p>
      ) : null}

      <div className="two-column">
        <section className="panel form-panel">
          <h2>Send to DAG</h2>
          {loaderData.inStore.length === 0 ? (
            <p className="muted">No in-store serials to send.</p>
          ) : (
            <Form method="post" className="stack">
              <CsrfField />
              <input type="hidden" name="intent" value="send" />
              <input type="hidden" name="idempotencyKey" value={sendKey} />
              <label>
                Tyre
                <select name="tyreId" required>
                  <option value="">Select serial</option>
                  {loaderData.inStore.map((tyre) => (
                    <option key={tyre.id} value={tyre.id}>
                      {tyre.serialNumber} — {tyre.sku} ({tyre.stage}) ·{" "}
                      {tyre.store}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                DAG supplier
                <select name="supplierId" required>
                  <option value="">Select supplier</option>
                  {loaderData.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.code} — {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Business date
                <input
                  type="date"
                  name="businessDate"
                  required
                  defaultValue={today}
                />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              <button className="button button-primary" disabled={busy}>
                Send to DAG
              </button>
            </Form>
          )}
        </section>

        <section className="panel form-panel">
          <h2>DAG return</h2>
          {loaderData.atDag.length === 0 ? (
            <p className="muted">No tyres currently at DAG.</p>
          ) : (
            <Form method="post" className="stack">
              <CsrfField />
              <input type="hidden" name="intent" value="receive" />
              <input type="hidden" name="idempotencyKey" value={receiveKey} />
              <label>
                Tyre
                <select name="tyreId" required>
                  <option value="">Select serial</option>
                  {loaderData.atDag.map((tyre) => (
                    <option key={tyre.id} value={tyre.id}>
                      {tyre.serialNumber} — {tyre.stage} ({tyre.store})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Return as stage
                <select
                  name="toStage"
                  required
                  value={toStage}
                  onChange={(event) =>
                    setToStage(
                      event.target.value as (typeof USABLE_TYRE_STAGES)[number],
                    )
                  }
                >
                  {USABLE_TYRE_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Receive as SKU
                <select name="targetPartId" required>
                  <option value="">Select SKU</option>
                  {stageParts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.sku} — {part.name}
                    </option>
                  ))}
                </select>
                {stageParts.length === 0 ? (
                  <span className="muted">
                    No tyre SKU matches stage {toStage}. Create one before
                    receiving.
                  </span>
                ) : null}
              </label>
              <label>
                Business date
                <input
                  type="date"
                  name="businessDate"
                  required
                  defaultValue={today}
                />
              </label>
              <label>
                Notes
                <textarea name="notes" rows={2} />
              </label>
              <button className="button button-primary" disabled={busy}>
                Receive DAG return
              </button>
            </Form>
          )}
        </section>
      </div>
    </>
  );
}

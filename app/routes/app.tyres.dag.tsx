import { useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
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
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres.dag";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const [inStore, atDag, tyreParts] = await Promise.all([
    listInStoreTyres(actor),
    listTyresAtDag(actor),
    listCategoryParts("TYRE"),
  ]);
  return { inStore, atDag, tyreParts };
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
  const busy = navigation.state !== "idle";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>DAG send / receive</h1>
          <p className="muted">
            Send a store serial to retread. When it returns, receive it as the
            next stage (ORG → DAG1 → DAG2 → DAG3). DAG3 comes back as scrap.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres">
            Tyre register
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
        <p className="muted">Tyre received from DAG.</p>
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
          <h2>Receive from DAG</h2>
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
                      {tyre.serialNumber} — {tyre.stage} → {tyre.nextStage} (
                      {tyre.store})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Receive as SKU
                <select name="targetPartId">
                  <option value="">Required unless scrap</option>
                  {loaderData.tyreParts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.sku} — {part.name}
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
                Receive from DAG
              </button>
            </Form>
          )}
        </section>
      </div>
    </>
  );
}

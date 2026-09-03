import { useEffect, useMemo, useState } from "react";
import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { workshopActionError } from "~/features/workshop/errors";
import {
  listCategoryParts,
  listInStoreTyres,
  listTyresAtDag,
} from "~/features/workshop/queries.server";
import {
  canSendToDag,
  dagAttemptLabel,
  expectedReturnStage,
  nextDagStage,
  skuMatchesLifecycleStage,
} from "~/features/workshop/tyre-lifecycle";
import type { TyreLifecycleStage } from "~/features/workshop/constants";
import {
  receiveTyreFromDag,
  rejectTyreAtDag,
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
    inStore: inStore.filter((tyre) =>
      canSendToDag(tyre.stage as TyreLifecycleStage),
    ),
    atDag,
    tyreParts,
    suppliers: suppliers.filter((row) => row.active),
    isAdmin: actor.role === "ADMIN",
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
    if (intent === "reject") {
      await rejectTyreAtDag(actor, Object.fromEntries(formData));
      return { ok: "rejected" as const };
    }
    return { error: "Unknown action" };
  } catch (error) {
    if (error instanceof Response) throw error;
    return { error: workshopActionError(error, "Unable to update DAG tyre") };
  }
}

export default function TyreDagPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID());
  const [receiveKey, setReceiveKey] = useState(() => crypto.randomUUID());
  const [sendTyreId, setSendTyreId] = useState("");
  const [receiveTyreId, setReceiveTyreId] = useState("");
  const [result, setResult] = useState<"success" | "reject">("success");
  const busy = navigation.state !== "idle";
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (actionData?.ok === "sent") {
      setSendKey(crypto.randomUUID());
      setSendTyreId("");
    }
    if (actionData?.ok === "received" || actionData?.ok === "rejected") {
      setReceiveKey(crypto.randomUUID());
      setReceiveTyreId("");
    }
  }, [actionData?.ok]);

  const selectedSend = loaderData.inStore.find((t) => t.id === sendTyreId);
  const selectedReceive = loaderData.atDag.find((t) => t.id === receiveTyreId);
  const expectedStage = selectedReceive
    ? expectedReturnStage(selectedReceive.stage as TyreLifecycleStage)
    : null;
  const stageParts = useMemo(() => {
    if (!expectedStage) return [];
    return loaderData.tyreParts.filter((part) =>
      skuMatchesLifecycleStage(part.sku, expectedStage),
    );
  }, [expectedStage, loaderData.tyreParts]);

  const daysAtSupplier =
    selectedReceive?.sentDate != null
      ? Math.max(
          0,
          Math.round(
            (Date.parse(today) - Date.parse(selectedReceive.sentDate)) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>DAG OUT / DAG IN</h1>
          <p className="muted">
            Three successful DAG cycles only: ORG → DAG1 → DAG2 → DAG3. Return
            stage is calculated automatically.
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
        <p className="muted">Tyre received from DAG.</p>
      ) : null}
      {actionData?.ok === "rejected" ? (
        <p className="muted">Supplier cannot-DAG recorded. Tyre disposed.</p>
      ) : null}

      <div className="two-column">
        <section className="panel form-panel">
          <h2>DAG OUT</h2>
          {loaderData.inStore.length === 0 ? (
            <p className="muted">
              No warehouse serials eligible for DAG (ORG / DAG1 / DAG2 only).
            </p>
          ) : (
            <Form method="post" className="stack">
              <CsrfField />
              <input type="hidden" name="intent" value="send" />
              <input type="hidden" name="idempotencyKey" value={sendKey} />
              <label>
                Tyre
                <select
                  name="tyreId"
                  required
                  value={sendTyreId}
                  onChange={(event) => setSendTyreId(event.target.value)}
                >
                  <option value="">Select serial</option>
                  {loaderData.inStore.map((tyre) => (
                    <option key={tyre.id} value={tyre.id}>
                      {tyre.serialNumber} — {tyre.sku} ({tyre.stage}) ·{" "}
                      {tyre.store}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSend ? (
                <p className="muted">
                  Current stage: {selectedSend.stage}
                  <br />
                  DAG attempt:{" "}
                  {dagAttemptLabel(selectedSend.stage as TyreLifecycleStage) ??
                    "—"}
                  <br />
                  Expected return:{" "}
                  {expectedReturnStage(
                    selectedSend.stage as TyreLifecycleStage,
                  ) ?? "—"}
                </p>
              ) : null}
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
                DAG out date
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
          <h2>DAG IN</h2>
          {loaderData.atDag.length === 0 ? (
            <p className="muted">No tyres currently at DAG.</p>
          ) : (
            <Form method="post" className="stack">
              <CsrfField />
              <input
                type="hidden"
                name="intent"
                value={result === "success" ? "receive" : "reject"}
              />
              {result === "success" ? (
                <input type="hidden" name="idempotencyKey" value={receiveKey} />
              ) : null}
              <label>
                Tyre
                <select
                  name="tyreId"
                  required
                  value={receiveTyreId}
                  onChange={(event) => setReceiveTyreId(event.target.value)}
                >
                  <option value="">Select serial</option>
                  {loaderData.atDag.map((tyre) => (
                    <option key={tyre.id} value={tyre.id}>
                      {tyre.serialNumber} — {tyre.stage} ({tyre.store})
                    </option>
                  ))}
                </select>
              </label>
              {selectedReceive ? (
                <p className="muted">
                  Original DAG OUT: {selectedReceive.sendDocumentNumber ?? "—"}
                  <br />
                  Supplier: {selectedReceive.supplier ?? "—"}
                  <br />
                  Sent stage: {selectedReceive.sentStage}
                  <br />
                  Sent date: {selectedReceive.sentDate ?? "—"}
                  {daysAtSupplier != null ? (
                    <>
                      <br />
                      Days at supplier: {daysAtSupplier}
                    </>
                  ) : null}
                  <br />
                  Expected return stage:{" "}
                  {expectedStage ??
                    (selectedReceive.stage === "DAG3"
                      ? "N/A (already DAG3)"
                      : "—")}
                </p>
              ) : null}
              <fieldset className="stack">
                <legend>Result</legend>
                <label>
                  <input
                    type="radio"
                    name="resultChoice"
                    checked={result === "success"}
                    onChange={() => setResult("success")}
                  />{" "}
                  DAG Successful
                </label>
                <label>
                  <input
                    type="radio"
                    name="resultChoice"
                    checked={result === "reject"}
                    onChange={() => setResult("reject")}
                    disabled={!loaderData.isAdmin}
                  />{" "}
                  Cannot DAG / Reject
                  {!loaderData.isAdmin ? " (admin only)" : ""}
                </label>
              </fieldset>
              {result === "success" ? (
                <>
                  <p className="muted">
                    Receive stage (system):{" "}
                    {expectedStage ??
                      (selectedReceive
                        ? (() => {
                            try {
                              return nextDagStage(
                                selectedReceive.stage as TyreLifecycleStage,
                              );
                            } catch {
                              return "unavailable";
                            }
                          })()
                        : "—")}
                  </p>
                  <label>
                    Receive SKU
                    <select name="targetPartId" required={result === "success"}>
                      <option value="">Select SKU</option>
                      {stageParts.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.sku} — {part.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Received date
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
                </>
              ) : (
                <>
                  <label>
                    Rejection reason
                    <textarea name="reason" rows={3} required minLength={3} />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" rows={2} />
                  </label>
                  <button className="button button-secondary" disabled={busy}>
                    Dispose without stock deduction
                  </button>
                </>
              )}
            </Form>
          )}
        </section>
      </div>
    </>
  );
}

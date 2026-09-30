import { useEffect, useMemo, useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { parseTyreIdQuery } from "~/features/workshop/dag-batch";
import { workshopActionResult } from "~/features/workshop/errors";
import {
  listCategoryParts,
  listInStoreTyres,
  listTyresAtDag,
} from "~/features/workshop/queries.server";
import {
  dagAttemptLabel,
  expectedReturnStage,
  skuMatchesLifecycleStage,
} from "~/features/workshop/tyre-lifecycle";
import type { TyreLifecycleStage } from "~/features/workshop/constants";
import {
  receiveTyresFromDag,
  rejectTyreAtDag,
  sendTyresToDag,
} from "~/features/workshop/tyres.server";
import { listSuppliers } from "~/features/master-data/queries.server";
import {
  assertPermission,
  requirePermission,
  rethrowAuthorizationError,
} from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres.dag";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "tyres.read");
  const [inStore, atDag, tyreParts, suppliers] = await Promise.all([
    listInStoreTyres(actor),
    listTyresAtDag(actor),
    listCategoryParts("TYRE"),
    listSuppliers(),
  ]);
  return {
    inStore: inStore.filter((tyre) => tyre.actions.canSendToDag),
    atDag,
    tyreParts,
    suppliers: suppliers.filter((row) => row.active),
    canReject: can(actor.role, "dag.reject"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "tyres.read");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  const payload = {
    ...Object.fromEntries(formData),
    tyreIds: formData.getAll("tyreIds"),
  };
  try {
    if (intent === "send") {
      assertPermission(actor, "dag.send");
      await sendTyresToDag(actor, payload);
      return { ok: "sent" as const };
    }
    if (intent === "receive") {
      assertPermission(actor, "dag.receive");
      await receiveTyresFromDag(actor, payload);
      return { ok: "received" as const };
    }
    if (intent === "reject") {
      assertPermission(actor, "dag.reject");
      await rejectTyreAtDag(actor, Object.fromEntries(formData));
      return { ok: "rejected" as const };
    }
    return { error: "Unknown action" };
  } catch (error) {
    rethrowAuthorizationError(error);
    return workshopActionResult(error, "Unable to update DAG tyre");
  }
}

function toggleId(current: string[], id: string) {
  return current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
}

export default function TyreDagPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID());
  const [receiveKey, setReceiveKey] = useState(() => crypto.randomUUID());
  const [sendTyreIds, setSendTyreIds] = useState<string[]>([]);
  const [receiveTyreIds, setReceiveTyreIds] = useState<string[]>(() =>
    parseTyreIdQuery(params.get("receive")),
  );
  const [result, setResult] = useState<"success" | "reject">("success");
  const busy = navigation.state !== "idle";
  const today = new Date().toISOString().slice(0, 10);
  const rejecting = loaderData.canReject && result === "reject";

  useEffect(() => {
    const requested = parseTyreIdQuery(params.get("send"));
    const allowed = new Set(loaderData.inStore.map((tyre) => tyre.id));
    setSendTyreIds(requested.filter((id) => allowed.has(id)));
  }, [loaderData.inStore, params]);

  useEffect(() => {
    if (!actionData || !("ok" in actionData)) return;
    if (actionData.ok === "sent") {
      setSendKey(crypto.randomUUID());
      setSendTyreIds([]);
    }
    if (actionData.ok === "received" || actionData.ok === "rejected") {
      setReceiveKey(crypto.randomUUID());
      setReceiveTyreIds([]);
    }
  }, [actionData]);

  const selectedSend = loaderData.inStore.filter((tyre) =>
    sendTyreIds.includes(tyre.id),
  );
  const selectedReceive = loaderData.atDag.filter((tyre) =>
    receiveTyreIds.includes(tyre.id),
  );
  const receivePreview = useMemo(() => {
    return selectedReceive.map((tyre) => {
      const expected = expectedReturnStage(tyre.stage as TyreLifecycleStage);
      const matches = expected
        ? loaderData.tyreParts.filter((part) =>
            skuMatchesLifecycleStage(part.sku, expected),
          )
        : [];
      return { tyre, expected, matches };
    });
  }, [loaderData.tyreParts, selectedReceive]);

  const errorText =
    actionData && "error" in actionData ? actionData.error : null;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>DAG OUT / DAG IN</h1>
          <p className="muted">
            Select one or more serials. Each tyre still posts its own ledger
            document in one batch. Three successful cycles only: ORG → DAG1 →
            DAG2 → DAG3.
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

      {errorText ? (
        <p className="form-error" style={{ whiteSpace: "pre-line" }}>
          {errorText}
        </p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "sent" ? (
        <p className="muted">Tyres sent to DAG.</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "received" ? (
        <p className="muted">Tyres received from DAG.</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "rejected" ? (
        <p className="muted">Supplier cannot-DAG recorded. Tyre disposed.</p>
      ) : null}

      <div className="two-column">
        <section className="panel form-panel">
          <h2>DAG OUT</h2>
          {loaderData.inStore.length === 0 ? (
            <p className="muted">
              No warehouse serials eligible for DAG. A tyre must complete a fit
              and removal in its current stage (ORG / DAG1 / DAG2).
            </p>
          ) : (
            <Form method="post" className="stack">
              <CsrfField />
              <input type="hidden" name="intent" value="send" />
              <input type="hidden" name="batchKey" value={sendKey} />
              <fieldset className="stack">
                <legend>Serials</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={
                      sendTyreIds.length === loaderData.inStore.length &&
                      loaderData.inStore.length > 0
                    }
                    onChange={(event) =>
                      setSendTyreIds(
                        event.target.checked
                          ? loaderData.inStore.map((tyre) => tyre.id)
                          : [],
                      )
                    }
                  />{" "}
                  Select all ({loaderData.inStore.length})
                </label>
                {loaderData.inStore.map((tyre) => (
                  <label key={tyre.id}>
                    <input
                      type="checkbox"
                      name="tyreIds"
                      value={tyre.id}
                      checked={sendTyreIds.includes(tyre.id)}
                      onChange={() =>
                        setSendTyreIds((current) => toggleId(current, tyre.id))
                      }
                    />{" "}
                    {tyre.serialNumber} — {tyre.sku} ({tyre.stage}) ·{" "}
                    {tyre.store}
                  </label>
                ))}
              </fieldset>
              {selectedSend.length > 0 ? (
                <p className="muted">
                  {selectedSend.map((tyre) => (
                    <span key={tyre.id}>
                      {tyre.serialNumber}:{" "}
                      {dagAttemptLabel(tyre.stage as TyreLifecycleStage) ?? "—"}{" "}
                      →{" "}
                      {expectedReturnStage(tyre.stage as TyreLifecycleStage) ??
                        "—"}
                      <br />
                    </span>
                  ))}
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
              <button
                className="button button-primary"
                disabled={busy || sendTyreIds.length === 0}
              >
                Send {sendTyreIds.length || ""} to DAG
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
                value={rejecting ? "reject" : "receive"}
              />
              {!rejecting ? (
                <input type="hidden" name="batchKey" value={receiveKey} />
              ) : null}
              <fieldset className="stack">
                <legend>Serials</legend>
                {!rejecting ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={
                        receiveTyreIds.length === loaderData.atDag.length &&
                        loaderData.atDag.length > 0
                      }
                      onChange={(event) =>
                        setReceiveTyreIds(
                          event.target.checked
                            ? loaderData.atDag.map((tyre) => tyre.id)
                            : [],
                        )
                      }
                    />{" "}
                    Select all ({loaderData.atDag.length})
                  </label>
                ) : null}
                {loaderData.atDag.map((tyre) => (
                  <label key={tyre.id}>
                    {!rejecting ? (
                      <input
                        type="checkbox"
                        name="tyreIds"
                        value={tyre.id}
                        checked={receiveTyreIds.includes(tyre.id)}
                        onChange={() =>
                          setReceiveTyreIds((current) =>
                            toggleId(current, tyre.id),
                          )
                        }
                      />
                    ) : (
                      <input
                        type="radio"
                        name="tyreId"
                        value={tyre.id}
                        checked={receiveTyreIds[0] === tyre.id}
                        onChange={() => setReceiveTyreIds([tyre.id])}
                      />
                    )}{" "}
                    {tyre.serialNumber} — {tyre.stage} ({tyre.store})
                  </label>
                ))}
              </fieldset>
              {receivePreview.length > 0 && !rejecting ? (
                <p className="muted">
                  {receivePreview.map(({ tyre, expected, matches }) => (
                    <span key={tyre.id}>
                      {tyre.serialNumber}: {tyre.sendDocumentNumber ?? "—"} ·{" "}
                      {expected ?? "—"}
                      {matches.length === 1 ? ` → ${matches[0].sku}` : ""}
                      {matches.length !== 1
                        ? ` (${matches.length} matching SKUs)`
                        : ""}
                      <br />
                    </span>
                  ))}
                </p>
              ) : null}
              {loaderData.canReject ? (
                <fieldset className="stack">
                  <legend>Result</legend>
                  <label>
                    <input
                      type="radio"
                      name="resultChoice"
                      checked={!rejecting}
                      onChange={() => setResult("success")}
                    />{" "}
                    DAG Successful
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="resultChoice"
                      checked={rejecting}
                      onChange={() => {
                        setResult("reject");
                        setReceiveTyreIds((current) => current.slice(0, 1));
                      }}
                    />{" "}
                    Cannot DAG / Reject
                  </label>
                </fieldset>
              ) : null}
              {!rejecting ? (
                <>
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
                  <button
                    className="button button-primary"
                    disabled={busy || receiveTyreIds.length === 0}
                  >
                    Receive {receiveTyreIds.length || ""} from DAG
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
                  <button
                    className="button button-secondary"
                    disabled={busy || receiveTyreIds.length !== 1}
                  >
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

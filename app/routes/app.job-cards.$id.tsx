import { useState } from "react";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { TyreDisposeForm } from "~/components/tyre-dispose-form";
import { StockLineItems } from "~/components/stock-line-items";
import { TyreMap } from "~/components/tyre-map";
import {
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  submitIssueForApproval,
} from "~/features/inventory/posting.server";
import {
  getRepetitiveIssueCounts,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import {
  TYRE_POSITION_LABELS,
  TYRE_POSITIONS,
  UNUSUAL_ISSUE_THRESHOLD,
} from "~/features/workshop/constants";
import { ZodError } from "zod";
import {
  WorkshopError,
  workshopActionResult,
} from "~/features/workshop/errors";
import { isSerializationFailure } from "~/lib/postgres-error";
import {
  cancelJobCard,
  closeJobCard,
} from "~/features/workshop/job-cards.server";
import { recordOilChange } from "~/features/workshop/oil.server";
import { getJobCardDetail } from "~/features/workshop/queries.server";
import {
  fitOrReplaceTyre,
  disposeTyre,
} from "~/features/workshop/tyres.server";
import {
  assertPermission,
  requirePermission,
  rethrowAuthorizationError,
} from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.job-cards.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "jobCards.read");
  const card = await getJobCardDetail(actor, params.id);
  if (!card) {
    throw data("Job card not found or you do not have access.", {
      status: 404,
    });
  }
  const url = new URL(request.url);
  const [options, unusualCounts] = await Promise.all([
    getTransactionOptions(actor),
    getRepetitiveIssueCounts(actor),
  ]);
  return {
    card,
    parts: options.parts,
    initialPartId: url.searchParams.get("part") || "",
    unusualCounts,
    unusualThreshold: UNUSUAL_ISSUE_THRESHOLD,
    canManage: can(actor.role, "approvals.manage"),
    canUpdate: can(actor.role, "jobCards.update"),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requirePermission(request, "jobCards.read");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  const jobCardId = params.id;

  try {
    if (intent === "issue") {
      assertPermission(actor, "issues.create");
      assertPermission(actor, "jobCards.update");
      const card = await getJobCardDetail(actor, jobCardId);
      if (!card || card.status !== "OPEN") {
        return { error: "Job card must be open to issue parts" };
      }
      const loaded = loadStockLines(formData);
      if (!loaded.ok) {
        return { error: loaded.error, lineErrors: loaded.lineErrors };
      }
      try {
        const result = await submitIssueForApproval(actor, {
          storeId: card.storeId,
          busId: card.busId,
          jobCardId: card.id,
          businessDate: card.businessDate,
          notes: formData.get("notes"),
          idempotencyKey: formData.get("idempotencyKey"),
          lines: loaded.lines,
        });
        throw redirect(`/receipts/${result.id}`);
      } catch (error) {
        rethrowAuthorizationError(error);
        if (error instanceof Response) throw error;
        const failure = stockLinesActionError(
          error,
          "Unable to update job card",
          loaded.lines,
          inventoryActionError,
        );
        return { error: failure.error, lineErrors: failure.lineErrors };
      }
    }
    if (intent === "fit-tyre") {
      assertPermission(actor, "tyres.manage");
      const result = await fitOrReplaceTyre(actor, {
        jobCardId,
        tyreId: formData.get("tyreId"),
        position: formData.get("position"),
        idempotencyKey: formData.get("idempotencyKey"),
      });
      throw redirect(`/receipts/${result.documentId}`);
    }
    if (intent === "dispose-tyre") {
      assertPermission(actor, "tyres.manage");
      await disposeTyre(actor, Object.fromEntries(formData));
      throw redirect(`/job-cards/${jobCardId}`);
    }
    if (intent === "oil") {
      assertPermission(actor, "jobCards.update");
      const result = await recordOilChange(actor, {
        jobCardId,
        partId: formData.get("partId"),
        litres: formData.get("litres"),
        notes: formData.get("notes"),
        idempotencyKey: formData.get("idempotencyKey"),
      });
      throw redirect(`/receipts/${result.documentId}`);
    }
    if (intent === "close") {
      assertPermission(actor, "jobCards.update");
      await closeJobCard(actor, {
        jobCardId,
        workDone: formData.get("workDone"),
      });
      throw redirect(`/job-cards/${jobCardId}`);
    }
    if (intent === "cancel") {
      assertPermission(actor, "jobCards.update");
      await cancelJobCard(actor, jobCardId);
      throw redirect("/job-cards");
    }
    return { error: "Unknown action" };
  } catch (error) {
    rethrowAuthorizationError(error);
    if (
      error instanceof WorkshopError ||
      error instanceof ZodError ||
      isSerializationFailure(error)
    ) {
      return workshopActionResult(error, "Unable to update job card");
    }
    return {
      error: inventoryActionError(error, "Unable to update job card"),
    };
  }
}

export default function JobCardDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { card, unusualCounts, unusualThreshold } = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [issueKey] = useState(() => crypto.randomUUID());
  const [tyreKey] = useState(() => crypto.randomUUID());
  const [oilKey] = useState(() => crypto.randomUUID());
  const [issuePartIds, setIssuePartIds] = useState<string[]>(
    loaderData.initialPartId ? [loaderData.initialPartId] : [],
  );
  const open = card.status === "OPEN";
  const pending = card.status === "PENDING_APPROVAL";
  const busy = navigation.state !== "idle";
  const unusualParts = issuePartIds.flatMap((partId) => {
    if (!partId) return [];
    const count =
      unusualCounts.find(
        (row) => row.partId === partId && row.busId === card.busId,
      )?.issueCount ?? 0;
    if (count < unusualThreshold) return [];
    const part = loaderData.parts.find((row) => row.id === partId);
    return [
      {
        label: part ? `${part.sku} — ${part.name}` : partId,
        count,
      },
    ];
  });

  const pendingApprovalsCount = card.documents.filter(
    (d) => d.status === "PENDING_APPROVAL",
  ).length;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Workshop · {card.type}</p>
          <h1>{card.jobNumber}</h1>
          <p className="muted">
            <Link to={`/buses/${card.busId}`}>{card.fleetNumber}</Link>
            {card.registrationNumber
              ? ` — ${card.registrationNumber}`
              : ""}{" "}
            {card.make || card.model
              ? `(${[card.make, card.model].filter(Boolean).join(" ")})`
              : ""}{" "}
            · {card.storeCode} · {card.businessDate}
          </p>
        </div>
        <div className="heading-actions">
          <span
            className={`badge ${card.type === "TOURISM" ? "accent" : "subtle"}`}
          >
            {card.type}
          </span>
          <span
            className={`badge ${
              open || pending
                ? "warning"
                : card.status === "CLOSED"
                  ? "success"
                  : card.status === "REJECTED"
                    ? "danger"
                    : ""
            }`}
          >
            {pending ? "Pending approval" : card.status}
          </span>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </div>

      {actionData && "error" in actionData ? (
        <p className="form-error no-print">{actionData.error}</p>
      ) : null}

      <div className="screen-only">
        <section
          className="panel receipt-panel"
          style={{ marginBottom: "1.5rem" }}
        >
          <p>
            <strong>Complaint:</strong> {card.complaint}
          </p>
          {card.mechanicName ? (
            <p>
              <strong>Mechanic:</strong> {card.mechanicName}
            </p>
          ) : null}
          {card.odometerKm ? (
            <p>
              <strong>Odometer:</strong> {card.odometerKm} km
            </p>
          ) : null}
          {card.workDone ? (
            <p>
              <strong>Work done:</strong> {card.workDone}
            </p>
          ) : null}
          {card.notes ? (
            <p>
              <strong>Notes:</strong> {card.notes}
            </p>
          ) : null}
          <p className="muted">
            Opened by {card.openedBy}
            {card.status === "REJECTED"
              ? " · Rejected"
              : card.closedAt
                ? ` · Closed ${new Date(card.closedAt).toLocaleString()}`
                : ""}
          </p>
        </section>

        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Tyres on this bus</h2>
          <TyreMap slots={card.fitted} />
        </section>

        {pending ? (
          <section
            className="panel no-print"
            style={{ marginBottom: "1.5rem" }}
          >
            <p>
              This job card is awaiting administrator approval. Parts, tyres,
              and oil can be posted after it is approved.
            </p>
            {loaderData.canManage ? (
              <p className="muted">
                <Link to="/approvals?tab=job-cards">Open Approvals Center</Link>
              </p>
            ) : (
              <p className="muted">
                Ask an administrator to approve this card.
              </p>
            )}
            {loaderData.canUpdate ? (
              <Form method="post" style={{ marginTop: "1rem" }}>
                <CsrfField />
                <input type="hidden" name="intent" value="cancel" />
                <button className="text-button" disabled={busy}>
                  Cancel unused card
                </button>
              </Form>
            ) : null}
          </section>
        ) : null}

        {open && loaderData.canUpdate ? (
          <>
            <section
              className="panel form-panel no-print"
              style={{ marginBottom: "1.5rem" }}
            >
              <h2>Issue parts</h2>
              <Form method="post" className="stack">
                <CsrfField />
                <input type="hidden" name="intent" value="issue" />
                <input type="hidden" name="idempotencyKey" value={issueKey} />
                <StockLineItems
                  parts={loaderData.parts}
                  initialPartId={loaderData.initialPartId || undefined}
                  lineErrors={
                    actionData && "lineErrors" in actionData
                      ? actionData.lineErrors
                      : undefined
                  }
                  onLinesChange={(rows) =>
                    setIssuePartIds(rows.map((row) => row.partId))
                  }
                />
                <label>
                  Notes
                  <textarea name="notes" rows={2} />
                </label>
                {unusualParts.length > 0 ? (
                  <p className="form-error">
                    Unusual request:{" "}
                    {unusualParts
                      .map(
                        (row) =>
                          `${row.label} has been issued to ${card.fleetNumber} ${row.count} times in the last 30 days`,
                      )
                      .join("; ")}{" "}
                    (threshold {unusualThreshold}).
                  </p>
                ) : null}
                <button className="button button-primary" disabled={busy}>
                  Submit for verification
                </button>
              </Form>
            </section>

            <div
              className="two-column no-print"
              style={{ marginBottom: "1.5rem" }}
            >
              <section className="panel form-panel" id="fit-tyre">
                <h2>Fit / replace tyre</h2>
                {card.storeTyres.length === 0 ? (
                  <p className="muted">
                    Register a tyre serial in store stock first.{" "}
                    <Link to="/tyres/import">Import new tyres</Link>
                  </p>
                ) : (
                  <Form method="post" className="stack">
                    <CsrfField />
                    <input type="hidden" name="intent" value="fit-tyre" />
                    <input
                      type="hidden"
                      name="idempotencyKey"
                      value={tyreKey}
                    />
                    <label>
                      Tyre serial
                      <select name="tyreId" required>
                        <option value="">Select tyre</option>
                        {card.storeTyres.map((tyre) => (
                          <option key={tyre.id} value={tyre.id}>
                            {tyre.serialNumber} — {tyre.sku} ({tyre.stage})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Position
                      <select name="position" required>
                        <option value="">Select position</option>
                        {TYRE_POSITIONS.map((position) => (
                          <option key={position} value={position}>
                            {position} — {TYRE_POSITION_LABELS[position]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted">
                      Stock deducts after an administrator verifies the issue.
                    </p>
                    <button className="button button-primary" disabled={busy}>
                      Submit tyre fit for verification
                    </button>
                  </Form>
                )}
              </section>

              <section className="panel form-panel">
                <h2>Oil change</h2>
                {card.oilParts.length === 0 ? (
                  <p className="muted">
                    Add an OIL-category part to record a change.
                  </p>
                ) : (
                  <Form method="post" className="stack">
                    <CsrfField />
                    <input type="hidden" name="intent" value="oil" />
                    <input type="hidden" name="idempotencyKey" value={oilKey} />
                    <label>
                      Oil
                      <select name="partId" required>
                        <option value="">Select oil</option>
                        {card.oilParts.map((part) => (
                          <option key={part.id} value={part.id}>
                            {part.sku} — {part.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Litres
                      <input
                        type="number"
                        name="litres"
                        min="0.001"
                        step="0.001"
                        required
                      />
                    </label>
                    <label>
                      Notes
                      <textarea name="notes" rows={2} />
                    </label>
                    <p className="muted">
                      Litres are reserved now and deducted after verification.
                    </p>
                    <button className="button button-primary" disabled={busy}>
                      Submit oil change for verification
                    </button>
                  </Form>
                )}
              </section>

              <section className="panel form-panel">
                <h2>Close job card</h2>
                <div
                  style={{
                    backgroundColor: "var(--color-paper-2, #f8f9fa)",
                    border: "1px solid var(--color-rule, #e5e7eb)",
                    borderRadius: "6px",
                    padding: "10px 12px",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "700",
                      marginBottom: "6px",
                      textTransform: "uppercase",
                      fontSize: "0.75rem",
                      letterSpacing: "0.05em",
                      color: "var(--muted, #6b7280)",
                    }}
                  >
                    Work & Stock Issued Summary
                  </div>
                  <div style={{ marginBottom: "4px" }}>
                    <strong>🛢️ Lubricants: </strong>
                    {card.oilChanges.length === 0 ? (
                      <span className="muted">None recorded</span>
                    ) : (
                      <span>
                        {card.oilChanges
                          .map((o) => `${o.part} (${o.litres}L)`)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: "4px" }}>
                    <strong>🛞 Tyres: </strong>
                    {card.tyreEvents.length === 0 ? (
                      <span className="muted">None recorded</span>
                    ) : (
                      <span>
                        {card.tyreEvents
                          .map(
                            (t) =>
                              `${t.type} ${t.serialNumber}${t.toPosition ? ` → ${t.toPosition}` : ""}`,
                          )
                          .join(", ")}
                      </span>
                    )}
                  </div>
                  <div>
                    <strong>🔩 Spare Parts: </strong>
                    {card.documents.length === 0 ? (
                      <span className="muted">None issued</span>
                    ) : (
                      <span>{card.documents.length} document line(s)</span>
                    )}
                  </div>
                  {pendingApprovalsCount > 0 ? (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "6px 8px",
                        backgroundColor: "#fef3c7",
                        color: "#92400e",
                        borderRadius: "4px",
                        fontWeight: "600",
                        fontSize: "0.8rem",
                      }}
                    >
                      ⚠️ {pendingApprovalsCount} issue(s) awaiting verification. Must be approved before closing.
                    </div>
                  ) : null}
                </div>

                <Form method="post" className="stack">
                  <CsrfField />
                  <input type="hidden" name="intent" value="close" />
                  <label>
                    Work done
                    <textarea
                      name="workDone"
                      rows={4}
                      required
                      minLength={3}
                      placeholder="Describe work completed by mechanics and technicians..."
                    />
                  </label>
                  <button
                    className="button button-primary"
                    disabled={busy || pendingApprovalsCount > 0}
                  >
                    Close card
                  </button>
                </Form>
                <Form method="post" style={{ marginTop: "1rem" }}>
                  <CsrfField />
                  <input type="hidden" name="intent" value="cancel" />
                  <button className="text-button" disabled={busy}>
                    Cancel unused card
                  </button>
                </Form>
              </section>
            </div>

            {card.removedWarehouse.length > 0 ? (
              <section
                className="panel no-print"
                style={{ marginBottom: "1.5rem" }}
              >
                <h2>Removed tyres in warehouse</h2>
                <p className="muted">
                  Shown after the replacement issue is verified.
                </p>
                <ul className="stack">
                  {card.removedWarehouse.map((tyre) => (
                    <li key={tyre.id}>
                      <Link to={`/tyres/${tyre.id}`}>{tyre.serialNumber}</Link>
                      {" — "}
                      {tyre.sku} ({tyre.stage})
                      {tyre.actions.canFit ? (
                        <>
                          {" · "}
                          <a href="#fit-tyre">Fit again</a>
                        </>
                      ) : null}
                      {tyre.actions.canSendToDag ? (
                        <>
                          {" · "}
                          <Link to={`/tyres/dag?send=${tyre.id}`}>
                            Send to DAG
                          </Link>
                        </>
                      ) : null}
                      {tyre.actions.canDispose ? (
                        <span
                          style={{ display: "inline", marginLeft: "0.5rem" }}
                        >
                          <TyreDisposeForm
                            tyreId={tyre.id}
                            businessDate={card.businessDate}
                            intent="dispose-tyre"
                          />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Parts issued / returned</h2>
          {card.documents.length === 0 ? (
            <p className="muted">No stock documents on this card yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>SKU</th>
                    <th>Part</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {card.documents.map((row) => (
                    <tr key={`${row.id}-${row.sku}`}>
                      <td className="mono">
                        <Link to={`/receipts/${row.id}`}>{row.number}</Link>
                      </td>
                      <td>
                        {row.type.replaceAll("_", " ")}
                        {row.status === "PENDING_APPROVAL"
                          ? " · pending"
                          : row.status === "REJECTED"
                            ? " · rejected"
                            : ""}
                      </td>
                      <td className="mono">{row.sku}</td>
                      <td>{row.part}</td>
                      <td className="quantity">{row.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Lubricant / Oil changes</h2>
          {card.oilChanges.length === 0 ? (
            <p className="muted">No lubricant or oil changes recorded on this card.</p>
          ) : (
            <ul>
              {card.oilChanges.map((row) => (
                <li key={row.id}>
                  <strong>{row.part}</strong> ({row.sku}) — <strong>{row.litres} L</strong>
                  {row.odometerKm
                    ? ` @ ${Number(row.odometerKm).toLocaleString()} km`
                    : ""}
                  {row.documentStatus === "PENDING_APPROVAL" ? (
                    <span
                      className="badge warning"
                      style={{ marginLeft: "6px" }}
                    >
                      awaiting verification
                    </span>
                  ) : row.documentStatus === "REJECTED" ? (
                    <span
                      className="badge danger"
                      style={{ marginLeft: "6px" }}
                    >
                      rejected
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Tyre activity</h2>
          {card.tyreEvents.length === 0 ? (
            <p className="muted">No tyre movements or tyres issued on this card.</p>
          ) : (
            <ul>
              {card.tyreEvents.map((row) => (
                <li key={row.id}>
                  <strong>{row.type}</strong> — Serial:{" "}
                  <span className="mono">{row.serialNumber}</span>
                  {row.toPosition ? ` → Position ${row.toPosition}` : ""}
                  {row.fromPosition ? ` from ${row.fromPosition}` : ""}
                  {row.status === "PENDING_APPROVAL" ? (
                    <span
                      className="badge warning"
                      style={{ marginLeft: "6px" }}
                    >
                      awaiting verification
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* DEDICATED COMPLETE MULTI-PAGE PRINT LAYOUT (A4 WORKSHOP STANDARD) */}
      <div className="print-only print-doc-container">
        {/* Printable Header */}
        <div className="print-header-bar">
          <div>
            <div
              style={{
                fontSize: "14pt",
                fontWeight: "900",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#111",
              }}
            >
              DS GUNASEKARA GROUP
            </div>
            <div
              style={{
                fontSize: "10pt",
                fontWeight: "700",
                color: "#333",
                letterSpacing: "0.02em",
                marginTop: "2px",
              }}
            >
              WORKSHOP & FLEET MAINTENANCE
            </div>
            <div style={{ fontSize: "9pt", color: "#555", marginTop: "2px" }}>
              Store: <strong>{card.storeCode}</strong> — {card.store}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "13pt",
                fontWeight: "800",
                textTransform: "uppercase",
                color: "#111",
                letterSpacing: "0.05em",
              }}
            >
              JOB CARD ({card.type})
            </div>
            <div
              style={{
                fontSize: "11pt",
                fontWeight: "700",
                fontFamily: "var(--font-mono, monospace)",
                marginTop: "3px",
              }}
            >
              {card.jobNumber}
            </div>
            <div style={{ fontSize: "9pt", color: "#555", marginTop: "2px" }}>
              {card.businessDate} • <strong>{card.status}</strong>
            </div>
          </div>
        </div>

        {/* Section 1: Vehicle & Job Information */}
        <div className="print-section-box">
          <div className="print-section-title">Vehicle & Job Information</div>
          <div className="print-section-body" style={{ padding: "8px 12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
              <tbody>
                <tr>
                  <td style={{ width: "18%", color: "#555", padding: "4px 0" }}>Fleet No.</td>
                  <td style={{ width: "32%", fontWeight: "700", padding: "4px 0" }}>
                    {card.fleetNumber || "—"}
                  </td>
                  <td style={{ width: "18%", color: "#555", padding: "4px 0" }}>Registration</td>
                  <td style={{ width: "32%", fontWeight: "700", padding: "4px 0" }}>
                    {card.registrationNumber || "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "#555", padding: "4px 0" }}>Make / Model</td>
                  <td style={{ padding: "4px 0" }}>
                    {[card.make, card.model].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ color: "#555", padding: "4px 0" }}>Odometer</td>
                  <td style={{ padding: "4px 0" }}>
                    {card.odometerKm ? `${Number(card.odometerKm).toLocaleString()} km` : "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "#555", padding: "4px 0" }}>Mechanic</td>
                  <td style={{ padding: "4px 0", fontWeight: "600" }}>
                    {card.mechanicName || "—"}
                  </td>
                  <td style={{ color: "#555", padding: "4px 0" }}>Opened By</td>
                  <td style={{ padding: "4px 0" }}>
                    {card.openedBy || "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ color: "#555", padding: "4px 0" }}>Opened Date</td>
                  <td style={{ padding: "4px 0" }}>{card.businessDate}</td>
                  <td style={{ color: "#555", padding: "4px 0" }}>Job Status</td>
                  <td style={{ padding: "4px 0", fontWeight: "700" }}>{card.status}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Driver / Inspector Complaint */}
        <div className="print-section-box">
          <div className="print-section-title">Driver / Inspector Complaint</div>
          <div
            className="print-section-body"
            style={{ minHeight: "44px", whiteSpace: "pre-wrap", fontWeight: "500" }}
          >
            {card.complaint || "—"}
          </div>
        </div>

        {/* Section 3: Work Done / Action Taken */}
        <div className="print-section-box">
          <div className="print-section-title">Work Done / Action Taken</div>
          <div className="print-section-body" style={{ minHeight: "48px" }}>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {card.workDone || "Pending completion..."}
            </div>
            {card.notes ? (
              <div style={{ marginTop: "6px", fontSize: "9.5pt", color: "#444" }}>
                <strong>Notes:</strong> {card.notes}
              </div>
            ) : null}
          </div>
        </div>

        {/* Section 4: Spare Parts Issued / Returned Table */}
        <div className="print-section-box" style={{ pageBreakInside: "auto" }}>
          <div className="print-section-title">Spare Parts Issued / Returned</div>
          {card.documents.length === 0 ? (
            <div className="print-section-body" style={{ fontStyle: "italic", color: "#666" }}>
              No spare parts issued on this job card.
            </div>
          ) : (
            <div>
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: "25%" }}>Document No.</th>
                    <th style={{ width: "14%" }}>Type</th>
                    <th style={{ width: "22%" }}>SKU</th>
                    <th>Description</th>
                    <th style={{ width: "12%", textAlign: "right" }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {card.documents.map((row, idx) => {
                    const isReturn = row.type.includes("RETURN");
                    return (
                      <tr key={`print-part-${row.id}-${row.sku}-${idx}`}>
                        <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "9pt" }}>
                          {row.number}
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: "700",
                              fontSize: "8.5pt",
                              padding: "1px 5px",
                              border: "1px solid #111",
                              backgroundColor: isReturn ? "#fff" : "#f1f3f5",
                              display: "inline-block",
                            }}
                          >
                            {isReturn ? "RETURN" : "ISSUE"}
                          </span>
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "9pt" }}>
                          {row.sku}
                        </td>
                        <td>{row.part}</td>
                        <td style={{ textAlign: "right", fontWeight: "700" }}>
                          {Number(row.quantity).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div
                style={{
                  padding: "6px 10px",
                  backgroundColor: "#fafafa",
                  borderTop: "1px solid #ccc",
                  textAlign: "right",
                  fontSize: "9.5pt",
                  fontWeight: "600",
                }}
              >
                Total Document Lines: {card.documents.length} item(s) • Total Quantity:{" "}
                {card.documents
                  .reduce((sum, d) => sum + Number(d.quantity), 0)
                  .toFixed(2)}{" "}
                units
              </div>
            </div>
          )}
        </div>

        {/* Section 5: Tyre Activity */}
        <div className="print-section-box">
          <div className="print-section-title">Tyre Activity</div>
          <div className="print-section-body">
            {card.tyreEvents.length === 0 ? (
              <span style={{ color: "#666", fontStyle: "italic" }}>
                No tyre movements or tyre replacements recorded for this job card.
              </span>
            ) : (
              <ul style={{ margin: "0", paddingLeft: "18px" }}>
                {card.tyreEvents.map((t) => (
                  <li key={`print-tyre-act-${t.id}`} style={{ marginBottom: "3px" }}>
                    <strong>{t.type}</strong> — Serial:{" "}
                    <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                      {t.serialNumber}
                    </span>
                    {t.toPosition ? ` → Position ${t.toPosition}` : ""}
                    {t.fromPosition ? ` (from ${t.fromPosition})` : ""}
                    {t.status === "PENDING_APPROVAL" ? (
                      <span
                        style={{
                          fontSize: "8pt",
                          color: "#b45309",
                          marginLeft: "6px",
                          fontWeight: "bold",
                        }}
                      >
                        [Awaiting Verification]
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Section 6: Lubricant / Oil Changes */}
        <div className="print-section-box">
          <div className="print-section-title">Lubricant / Oil Changes</div>
          <div className="print-section-body">
            {card.oilChanges.length === 0 ? (
              <span style={{ color: "#666", fontStyle: "italic" }}>
                No lubricant or oil changes recorded for this job card.
              </span>
            ) : (
              <ul style={{ margin: "0", paddingLeft: "18px" }}>
                {card.oilChanges.map((o) => (
                  <li key={`print-oil-act-${o.id}`} style={{ marginBottom: "3px" }}>
                    <strong>{o.part}</strong> ({o.sku}) — <strong>{o.litres} Litres</strong>
                    {o.odometerKm ? ` @ ${Number(o.odometerKm).toLocaleString()} km` : ""}
                    {o.documentStatus === "PENDING_APPROVAL" ? (
                      <span
                        style={{
                          fontSize: "8pt",
                          color: "#b45309",
                          marginLeft: "6px",
                          fontWeight: "bold",
                        }}
                      >
                        [Awaiting Verification]
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Section 7: Completion & Verification Signatures */}
        <div className="print-section-box" style={{ marginTop: "16px", pageBreakInside: "avoid" }}>
          <div className="print-section-title">Completion / Verification Signatures</div>
          <div className="print-section-body" style={{ padding: "14px 12px 8px 12px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "24px",
                textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontWeight: "700", fontSize: "9.5pt", marginBottom: "32px" }}>
                  Mechanic / Technician
                </div>
                <div style={{ borderTop: "1.5px solid #111", paddingTop: "4px" }}>
                  <div style={{ fontSize: "9pt" }}>
                    Name: <strong>{card.mechanicName || "____________________"}</strong>
                  </div>
                  <div style={{ fontSize: "9pt", marginTop: "3px" }}>Date: ____________________</div>
                  <div style={{ fontSize: "8pt", color: "#555", marginTop: "4px" }}>Work Completed</div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: "700", fontSize: "9.5pt", marginBottom: "32px" }}>
                  Storekeeper
                </div>
                <div style={{ borderTop: "1.5px solid #111", paddingTop: "4px" }}>
                  <div style={{ fontSize: "9pt" }}>Name: ____________________</div>
                  <div style={{ fontSize: "9pt", marginTop: "3px" }}>Date: ____________________</div>
                  <div style={{ fontSize: "8pt", color: "#555", marginTop: "4px" }}>Parts Verified</div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: "700", fontSize: "9.5pt", marginBottom: "32px" }}>
                  Workshop Supervisor
                </div>
                <div style={{ borderTop: "1.5px solid #111", paddingTop: "4px" }}>
                  <div style={{ fontSize: "9pt" }}>Name: ____________________</div>
                  <div style={{ fontSize: "9pt", marginTop: "3px" }}>Date: ____________________</div>
                  <div style={{ fontSize: "8pt", color: "#555", marginTop: "4px" }}>Final Approval</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Standard StoreOPS Print Footer */}
        <div className="print-footer-bar">
          <div>StoreOPS • DS Gunasekara Group</div>
          <div>{card.jobNumber}</div>
          <div>Printed: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </div>
    </>
  );
}

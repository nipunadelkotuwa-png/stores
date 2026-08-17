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
import { StockLineItems } from "~/components/stock-line-items";
import { TyreMap } from "~/components/tyre-map";
import {
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  postStock,
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
import { workshopActionError } from "~/features/workshop/errors";
import {
  cancelJobCard,
  closeJobCard,
} from "~/features/workshop/job-cards.server";
import { recordOilChange } from "~/features/workshop/oil.server";
import { getJobCardDetail } from "~/features/workshop/queries.server";
import { fitOrReplaceTyre } from "~/features/workshop/tyres.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.job-cards.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requireUser(request);
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
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  const jobCardId = params.id;

  try {
    if (intent === "issue") {
      const card = await getJobCardDetail(actor, jobCardId);
      if (!card || card.status !== "OPEN") {
        return { error: "Job card must be open to issue parts" };
      }
      const loaded = loadStockLines(formData);
      if (!loaded.ok) {
        return { error: loaded.error, lineErrors: loaded.lineErrors };
      }
      try {
        const result = await postStock(actor, "BUS_ISSUE", {
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
      await fitOrReplaceTyre(actor, {
        jobCardId,
        tyreId: formData.get("tyreId"),
        position: formData.get("position"),
        idempotencyKey: formData.get("idempotencyKey"),
      });
      throw redirect(`/job-cards/${jobCardId}`);
    }
    if (intent === "oil") {
      await recordOilChange(actor, {
        jobCardId,
        partId: formData.get("partId"),
        litres: formData.get("litres"),
        notes: formData.get("notes"),
        idempotencyKey: formData.get("idempotencyKey"),
      });
      throw redirect(`/job-cards/${jobCardId}`);
    }
    if (intent === "close") {
      await closeJobCard(actor, {
        jobCardId,
        workDone: formData.get("workDone"),
      });
      throw redirect(`/job-cards/${jobCardId}`);
    }
    if (intent === "cancel") {
      await cancelJobCard(actor, jobCardId);
      throw redirect("/job-cards");
    }
    return { error: "Unknown action" };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error:
        workshopActionError(error, "") ||
        inventoryActionError(error, "Unable to update job card"),
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

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>{card.jobNumber}</h1>
          <p className="muted">
            <Link to={`/buses/${card.busId}`}>{card.fleetNumber}</Link>
            {card.registrationNumber
              ? ` — ${card.registrationNumber}`
              : ""} · {card.storeCode} · {card.businessDate}
          </p>
        </div>
        <div className="heading-actions">
          <span
            className={`badge ${card.status === "OPEN" ? "warning" : card.status === "CLOSED" ? "success" : ""}`}
          >
            {card.status}
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

      {actionData?.error ? (
        <p className="form-error no-print">{actionData.error}</p>
      ) : null}

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
          {card.closedAt
            ? ` · Closed ${new Date(card.closedAt).toLocaleString()}`
            : ""}
        </p>
      </section>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2>Tyres on this bus</h2>
        <TyreMap slots={card.fitted} />
      </section>

      {open ? (
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
                lineErrors={actionData?.lineErrors}
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
                Post issue
              </button>
            </Form>
          </section>

          <div
            className="two-column no-print"
            style={{ marginBottom: "1.5rem" }}
          >
            <section className="panel form-panel">
              <h2>Fit / replace tyre</h2>
              {card.storeTyres.length === 0 ? (
                <p className="muted">
                  Register a tyre serial in store stock first.{" "}
                  <Link to="/tyres">Tyres</Link>
                </p>
              ) : (
                <Form method="post" className="stack">
                  <CsrfField />
                  <input type="hidden" name="intent" value="fit-tyre" />
                  <input type="hidden" name="idempotencyKey" value={tyreKey} />
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
                  <button className="button button-primary" disabled={busy}>
                    Fit tyre
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
                  <button className="button button-primary" disabled={busy}>
                    Record oil change
                  </button>
                </Form>
              )}
            </section>

            <section className="panel form-panel">
              <h2>Close job card</h2>
              <Form method="post" className="stack">
                <CsrfField />
                <input type="hidden" name="intent" value="close" />
                <label>
                  Work done
                  <textarea name="workDone" rows={4} required minLength={3} />
                </label>
                <button className="button button-primary" disabled={busy}>
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
                    <td>{row.type.replaceAll("_", " ")}</td>
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

      {card.oilChanges.length > 0 ? (
        <section className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2>Oil changes</h2>
          <ul>
            {card.oilChanges.map((row) => (
              <li key={row.id}>
                {row.part} ({row.sku}) — {row.litres} L
                {row.odometerKm ? ` @ ${row.odometerKm} km` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.tyreEvents.length > 0 ? (
        <section className="panel">
          <h2>Tyre work</h2>
          <ul>
            {card.tyreEvents.map((row) => (
              <li key={row.id}>
                {row.type} {row.serialNumber}
                {row.toPosition ? ` → ${row.toPosition}` : ""}
                {row.fromPosition ? ` from ${row.fromPosition}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

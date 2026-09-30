import { data, Link, useActionData } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSection,
  ReportSignatures,
  ReportStatusBadge,
  ReportTable,
} from "~/components/report-primitives";
import { TyreDisposeForm } from "~/components/tyre-dispose-form";
import { workshopActionResult } from "~/features/workshop/errors";
import { getTyreDetail } from "~/features/workshop/queries.server";
import {
  fitActionLabel,
  statusLabel,
} from "~/features/workshop/tyre-lifecycle";
import { disposeTyre } from "~/features/workshop/tyres.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.tyres.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "tyres.read");
  const tyre = await getTyreDetail(actor, params.id);
  if (!tyre) {
    throw data("Tyre not found or you do not have access.", { status: 404 });
  }
  return { tyre };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "tyres.manage");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  try {
    await disposeTyre(actor, Object.fromEntries(formData));
    return { ok: true };
  } catch (error) {
    if (error instanceof Response) throw error;
    return workshopActionResult(error, "Unable to dispose tyre");
  }
}

export default function TyreDetailPage({ loaderData }: Route.ComponentProps) {
  const { tyre } = loaderData;
  const actionData = useActionData<typeof action>();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1 className="mono">{tyre.serialNumber}</h1>
          <p className="muted">
            {tyre.sku} — {tyre.part}
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/tyres">
            Back to register
          </Link>
          <ReportActions
            filename={`tyre-record-${tyre.serialNumber}`}
            documentTitle={`Tyre Lifecycle • ${tyre.serialNumber}`}
            targetSelector="#printable-tyre-report"
          />
          {tyre.actions.canFit ? (
            <Link className="button button-secondary" to="/job-cards">
              {fitActionLabel(tyre.actions)}
            </Link>
          ) : null}
          {tyre.actions.canSendToDag ? (
            <Link
              className="button button-primary"
              to={`/tyres/dag?send=${tyre.id}`}
            >
              Send to DAG
            </Link>
          ) : null}
          {tyre.status === "AT_DAG" ? (
            <Link
              className="button button-primary"
              to={`/tyres/dag?receive=${tyre.id}`}
            >
              DAG IN
            </Link>
          ) : null}
        </div>
      </div>

      {actionData && "error" in actionData ? (
        <p className="form-error no-print">{actionData.error}</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="muted no-print">Tyre disposed.</p>
      ) : null}

      {/* Interactive Controls & Disposal Form (Screen Only) */}
      <section className="panel no-print" style={{ marginBottom: "1.5rem" }}>
        <p>
          <strong>Current stage:</strong> {tyre.stage}
        </p>
        <p>
          <strong>Location:</strong> {statusLabel(tyre.status)}
          {tyre.status === "FITTED"
            ? ` · ${tyre.fleetNumber ?? "Bus"}${tyre.position ? ` · ${tyre.position}` : ""}`
            : tyre.storeCode
              ? ` · ${tyre.storeCode}`
              : ""}
        </p>
        {tyre.notes ? (
          <p>
            <strong>Notes:</strong> {tyre.notes}
          </p>
        ) : null}
        {tyre.actions.canDispose ? (
          <div style={{ marginTop: "1rem" }}>
            <TyreDisposeForm
              tyreId={tyre.id}
              businessDate={today}
              className="stack"
              buttonClassName="button button-secondary"
            />
          </div>
        ) : null}
      </section>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-tyre-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Tyre Asset Lifecycle Record"
            department="Workshop Tyre Asset Management & Inspection Record"
            documentNumber={tyre.serialNumber}
            date={today}
            status={tyre.status}
            subtitle="Individual Serial Tracked Tyre Asset History"
          />

          <div style={{ marginBottom: "16px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Serial Number", value: tyre.serialNumber, highlight: true },
                { label: "SKU / Brand", value: tyre.sku, highlight: true },
                { label: "Part Description", value: tyre.part },
                { label: "Lifecycle Stage", value: tyre.stage },
                {
                  label: "Location / Assignment",
                  value:
                    tyre.status === "FITTED"
                      ? `Bus ${tyre.fleetNumber ?? "—"} (${tyre.position ?? "—"})`
                      : tyre.storeCode
                        ? `${tyre.storeCode} Warehouse`
                        : statusLabel(tyre.status),
                  highlight: true,
                },
                { label: "Status", value: <ReportStatusBadge status={tyre.status} /> },
                { label: "Logged Events", value: `${tyre.events.length} Events` },
                { label: "Audit Date", value: today },
              ]}
            />
          </div>

          {tyre.notes ? (
            <div
              style={{
                fontSize: "8.5pt",
                padding: "8px 12px",
                backgroundColor: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "3px",
                marginBottom: "16px",
              }}
            >
              <strong>Asset Notes / Condition:</strong> {tyre.notes}
            </div>
          ) : null}

          <div style={{ marginBottom: "18px" }}>
            <ReportSection title={`Complete Lifecycle & Movement History (${tyre.events.length} Events)`}>
              {tyre.events.length === 0 ? (
                <ReportEmptyState message="No movements or operational events recorded for this tyre serial." />
              ) : (
                <ReportTable
                  headers={[
                    { label: "Date", width: "12%" },
                    { label: "Action", width: "14%" },
                    { label: "Stage Transition", width: "16%" },
                    { label: "Bus / Location", width: "18%" },
                    { label: "Odometer / Mileage", width: "16%" },
                    { label: "Document Ref", width: "12%" },
                    { label: "Technician", width: "12%" },
                  ]}
                >
                  {tyre.events.map((event, index) => {
                    const prev = tyre.events[index - 1];
                    let runKm: string | null = null;
                    if (
                      event.type === "REMOVE" &&
                      prev &&
                      (prev.type === "FIT" || prev.type === "REPLACE") &&
                      event.odometerKm &&
                      prev.odometerKm
                    ) {
                      const delta =
                        Number(event.odometerKm) - Number(prev.odometerKm);
                      if (Number.isFinite(delta) && delta >= 0) {
                        runKm = delta.toLocaleString();
                      }
                    }

                    return (
                      <tr key={event.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {new Date(event.occurredAt).toLocaleDateString("en-GB")}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                          <span
                            style={{
                              fontSize: "7.5pt",
                              fontWeight: "700",
                              padding: "1px 5px",
                              borderRadius: "2px",
                              backgroundColor: "#f3f4f6",
                              color: "#111827",
                            }}
                          >
                            {event.type.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {event.fromStage || event.toStage
                            ? `${event.fromStage ?? "—"} → ${event.toStage ?? "—"}`
                            : "—"}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {event.fleetNumber ? `Bus ${event.fleetNumber}` : ""}
                          {event.toPosition ? ` (${event.toPosition})` : event.fromPosition ? ` (Ex: ${event.fromPosition})` : ""}
                          {event.store ? (event.fleetNumber ? ` • ${event.store}` : event.store) : ""}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {event.odometerKm ? `${event.odometerKm} km` : "—"}
                          {runKm ? <div style={{ fontSize: "7.5pt", color: "#15803d", fontWeight: "600" }}>Run: {runKm} km</div> : null}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                          {event.documentNumber ? (
                            <span className="mono" style={{ fontSize: "8pt", fontWeight: "700", color: "#111827" }}>
                              {event.documentNumber}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8pt", color: "#6b7280" }}>
                          {event.actor}
                        </td>
                      </tr>
                    );
                  })}
                </ReportTable>
              )}
            </ReportSection>
          </div>

          <div style={{ marginTop: "24px" }}>
            <ReportSignatures
              signatures={[
                { role: "Tyre Technician", description: "Inspection Completed" },
                { role: "Workshop Foreman", description: "Technical Verification" },
              ]}
            />
          </div>

          <ReportFooter
            reportName={`Tyre Asset Lifecycle Record • ${tyre.serialNumber}`}
            documentId={tyre.serialNumber}
          />
        </ReportLayout>
      </div>
    </>
  );
}

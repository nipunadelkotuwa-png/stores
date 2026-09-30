import { data, Link } from "react-router";
import { ReportActions } from "~/components/report-actions";
import {
  ReportEmptyState,
  ReportFooter,
  ReportHeader,
  ReportInfoGrid,
  ReportLayout,
  ReportSection,
  ReportSignatures,
  ReportTable,
} from "~/components/report-primitives";
import { TyreMap } from "~/components/tyre-map";
import { busStatusLabel } from "~/features/master-data/bus-lifecycle";
import { getBusHistory } from "~/features/workshop/history.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.buses.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "masterData.read");
  const history = await getBusHistory(actor, params.id);
  if (!history) {
    throw data("Bus not found.", { status: 404 });
  }
  return history;
}

export default function BusHistoryPage({ loaderData }: Route.ComponentProps) {
  const { bus, fitted, lastOil, lastOdometer, timeline } = loaderData;
  const currentDate = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Fleet history</p>
          <h1>
            {bus.fleetNumber}
            {bus.registrationNumber ? ` — ${bus.registrationNumber}` : ""}
          </h1>
          <p className="muted">
            {[bus.make, bus.model].filter(Boolean).join(" ") || "Fleet bus"} ·{" "}
            {busStatusLabel(bus.status)}
            {bus.status === "SOLD" && bus.soldAt
              ? ` · ${new Date(bus.soldAt).toLocaleDateString()}`
              : ""}
            {bus.status === "SOLD" && bus.soldReason
              ? ` · ${bus.soldReason}`
              : ""}
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-secondary" to="/buses">
            All buses
          </Link>
          <ReportActions
            filename={`bus-ledger-${bus.fleetNumber}`}
            documentTitle={`Bus Ledger • ${bus.fleetNumber}`}
            targetSelector="#printable-bus-report"
          />
          {bus.status === "ACTIVE" ? (
            <Link
              className="button button-primary"
              to={`/job-cards/new?bus=${bus.id}`}
            >
              Open job card
            </Link>
          ) : null}
        </div>
      </div>

      <section className="metric-grid no-print" style={{ marginBottom: "1.5rem" }}>
        <article className="card metric-card">
          <span className="metric-label">Last odometer</span>
          <strong className="metric-value">
            {lastOdometer ? `${lastOdometer} km` : "—"}
          </strong>
        </article>
        <article className="card metric-card">
          <span className="metric-label">Last oil change</span>
          <strong className="metric-value" style={{ fontSize: "1.15rem" }}>
            {lastOil
              ? `${lastOil.businessDate} · ${lastOil.litres} L`
              : "None recorded"}
          </strong>
          {lastOil ? (
            <small>
              {lastOil.part}
              {lastOil.odometerKm ? ` @ ${lastOil.odometerKm} km` : ""}
            </small>
          ) : null}
        </article>
      </section>

      {/* Official A4 Printable Report Sheet */}
      <div id="printable-bus-report" className="print-doc-container report-sheet">
        <ReportLayout mode="report">
          <ReportHeader
            title="Bus Maintenance Ledger"
            department="Workshop & Fleet Maintenance Department"
            documentNumber={bus.fleetNumber}
            date={currentDate}
            status={bus.status}
            subtitle="Vehicle Asset Maintenance & Inspection Record"
          />

          <div style={{ marginBottom: "16px" }}>
            <ReportInfoGrid
              columns={4}
              items={[
                { label: "Fleet Number", value: bus.fleetNumber, highlight: true },
                { label: "Registration No", value: bus.registrationNumber || "—", highlight: true },
                { label: "Make / Model", value: [bus.make, bus.model].filter(Boolean).join(" ") || "—" },
                { label: "Vehicle Status", value: busStatusLabel(bus.status) },
                { label: "Odometer Reading", value: lastOdometer ? `${lastOdometer} km` : "—" },
                {
                  label: "Last Oil Service",
                  value: lastOil ? `${lastOil.businessDate} (${lastOil.litres}L)` : "None",
                },
                { label: "Current Tyres Fitted", value: `${fitted.length} Positions Active` },
                { label: "Audit Ledger Date", value: currentDate },
              ]}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <ReportSection title="Current Wheel & Tyre Positions">
              <div style={{ padding: "8px 0" }}>
                <TyreMap slots={fitted} />
              </div>
            </ReportSection>
          </div>

          <div style={{ marginBottom: "18px" }}>
            <ReportSection title={`Maintenance & Service History (${timeline.length} Events)`}>
              {timeline.length === 0 ? (
                <ReportEmptyState message="No maintenance events or service records logged for this vehicle yet." />
              ) : (
                <ReportTable
                  headers={[
                    { label: "Type", width: "14%" },
                    { label: "Date", width: "12%" },
                    { label: "Document / Ref", width: "22%" },
                    { label: "Description / Action Details", width: "52%" },
                  ]}
                >
                  {timeline.map((entry, index) => {
                    let typeLabel = "Event";
                    let dateStr = "—";
                    let docRef: React.ReactNode = "—";
                    let desc = "";

                    if (entry.kind === "job_card") {
                      typeLabel = "JOB CARD";
                      dateStr = entry.card.businessDate;
                      docRef = (
                        <Link
                          to={`/job-cards/${entry.card.id}`}
                          className="mono"
                          style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                        >
                          {entry.card.jobNumber}
                        </Link>
                      );
                      desc = `${entry.card.complaint} (${entry.card.status} · ${entry.card.store})`;
                    } else if (entry.kind === "oil") {
                      typeLabel = "OIL SERVICE";
                      dateStr = entry.oil.businessDate;
                      docRef = <span className="mono">{entry.oil.part}</span>;
                      desc = `${entry.oil.litres} L ${entry.oil.odometerKm ? `@ ${entry.oil.odometerKm} km` : ""}`;
                    } else if (entry.kind === "tyre") {
                      typeLabel = "TYRE FIT";
                      dateStr = "—";
                      docRef = <span className="mono">{entry.tyre.serialNumber}</span>;
                      desc = `${entry.tyre.type} ${entry.tyre.toPosition ? `→ ${entry.tyre.toPosition}` : ""} ${entry.tyre.toStage ? `(${entry.tyre.toStage})` : ""}`;
                    } else if (entry.kind === "stock") {
                      typeLabel = "PARTS ISSUE";
                      dateStr = entry.stock.date || "—";
                      docRef = (
                        <Link
                          to={`/receipts/${entry.stock.id}`}
                          className="mono"
                          style={{ fontWeight: "700", color: "#111827", textDecoration: "none" }}
                        >
                          {entry.stock.number}
                        </Link>
                      );
                      desc = `${entry.stock.sku} × ${entry.stock.quantity} (${entry.stock.type.replaceAll("_", " ")})`;
                    }

                    return (
                      <tr key={`${entry.kind}-${index}`} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "5px 8px", verticalAlign: "top" }}>
                          <span
                            style={{
                              fontSize: "7.5pt",
                              fontWeight: "700",
                              padding: "1px 5px",
                              borderRadius: "2px",
                              backgroundColor: entry.kind === "job_card" ? "#fef3c7" : "#f3f4f6",
                              color: entry.kind === "job_card" ? "#92400e" : "#1f2937",
                            }}
                          >
                            {typeLabel}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {dateStr}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt" }}>
                          {docRef}
                        </td>
                        <td style={{ padding: "5px 8px", verticalAlign: "top", fontSize: "8.5pt", color: "#374151" }}>
                          {desc}
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
                { role: "Workshop Foreman", description: "Maintenance Inspected" },
                { role: "Fleet Operations Manager", description: "Fleet Verification Approved" },
              ]}
            />
          </div>

          <ReportFooter
            reportName={`Bus Maintenance Ledger • ${bus.fleetNumber}`}
            documentId={bus.registrationNumber || bus.fleetNumber}
          />
        </ReportLayout>
      </div>
    </>
  );
}

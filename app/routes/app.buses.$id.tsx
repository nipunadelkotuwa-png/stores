import { data, Link } from "react-router";
import {
  ReportPrintFooter,
  ReportPrintHeader,
} from "~/components/report-print-header";
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
  return (
    <>
      <ReportPrintHeader
        title={`Bus Maintenance Ledger • ${bus.fleetNumber}`}
        subtitle="Workshop & Fleet Asset Lifecycle Register"
        metadata={[
          { label: "Fleet Number", value: bus.fleetNumber },
          { label: "Registration No", value: bus.registrationNumber || "—" },
          { label: "Make / Model", value: [bus.make, bus.model].filter(Boolean).join(" ") || "—" },
          { label: "Status", value: busStatusLabel(bus.status) },
          { label: "Odometer", value: lastOdometer ? `${lastOdometer} km` : "—" },
        ]}
      />

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
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
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

      <section className="metric-grid" style={{ marginBottom: "1.5rem" }}>
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

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2>Current tyres</h2>
        <TyreMap slots={fitted} />
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        {timeline.length === 0 ? (
          <div className="empty-state">
            <strong>No workshop history yet</strong>
            <p>Job cards, issues, tyre work, and oil changes appear here.</p>
          </div>
        ) : (
          <ol className="history-timeline">
            {timeline.map((entry, index) => (
              <li key={`${entry.kind}-${index}`}>
                {entry.kind === "job_card" ? (
                  <>
                    <span className="badge warning">Job card</span>{" "}
                    <Link to={`/job-cards/${entry.card.id}`}>
                      {entry.card.jobNumber}
                    </Link>{" "}
                    <span className="muted">
                      {entry.card.businessDate} · {entry.card.status} ·{" "}
                      {entry.card.store}
                    </span>
                    <div>{entry.card.complaint}</div>
                  </>
                ) : null}
                {entry.kind === "oil" ? (
                  <>
                    <span className="badge">Oil</span> {entry.oil.part} —{" "}
                    {entry.oil.litres} L
                    <span className="muted">
                      {" "}
                      · {entry.oil.businessDate}
                      {entry.oil.odometerKm
                        ? ` @ ${entry.oil.odometerKm} km`
                        : ""}
                    </span>
                  </>
                ) : null}
                {entry.kind === "tyre" ? (
                  <>
                    <span className="badge">Tyre</span> {entry.tyre.type}{" "}
                    {entry.tyre.serialNumber}
                    {entry.tyre.toPosition ? ` → ${entry.tyre.toPosition}` : ""}
                    {entry.tyre.toStage ? ` (${entry.tyre.toStage})` : ""}
                  </>
                ) : null}
                {entry.kind === "stock" ? (
                  <>
                    <span className="badge">Stock</span>{" "}
                    <Link to={`/receipts/${entry.stock.id}`}>
                      {entry.stock.number}
                    </Link>{" "}
                    {entry.stock.sku} × {entry.stock.quantity}
                    <span className="muted">
                      {" "}
                      · {entry.stock.type.replaceAll("_", " ")}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <ReportPrintFooter
        reportName={`Bus Maintenance Ledger • ${bus.fleetNumber}`}
        documentId={bus.registrationNumber || bus.fleetNumber}
      />
    </>
  );
}

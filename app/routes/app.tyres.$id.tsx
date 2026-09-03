import { data, Link } from "react-router";
import { getTyreDetail } from "~/features/workshop/queries.server";
import { statusLabel } from "~/features/workshop/tyre-lifecycle";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.tyres.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const tyre = await getTyreDetail(actor, params.id);
  if (!tyre) {
    throw data("Tyre not found or you do not have access.", { status: 404 });
  }
  return { tyre };
}

export default function TyreDetailPage({ loaderData }: Route.ComponentProps) {
  const { tyre } = loaderData;
  return (
    <>
      <div className="page-heading">
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
          <Link className="button button-secondary" to="/tyres/dag">
            DAG OUT / IN
          </Link>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: "1.5rem" }}>
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
      </section>

      <section className="panel">
        <h2>Lifecycle</h2>
        {tyre.events.length === 0 ? (
          <p className="muted">No events recorded.</p>
        ) : (
          <ol className="stack" style={{ gap: "1rem", paddingLeft: "1.25rem" }}>
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
                <li key={event.id}>
                  <strong>
                    {new Date(event.occurredAt).toLocaleDateString()}
                  </strong>{" "}
                  — {event.type.replaceAll("_", " ")}
                  {event.fromStage || event.toStage
                    ? ` · ${event.fromStage ?? "—"} → ${event.toStage ?? "—"}`
                    : ""}
                  {event.toPosition
                    ? ` · Position ${event.toPosition}`
                    : event.fromPosition
                      ? ` · From ${event.fromPosition}`
                      : ""}
                  {event.fleetNumber ? ` · Bus ${event.fleetNumber}` : ""}
                  {event.store ? ` · ${event.store}` : ""}
                  {event.documentNumber ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="mono">{event.documentNumber}</span>
                    </>
                  ) : null}
                  {event.odometerKm ? ` · ${event.odometerKm} km` : ""}
                  {runKm ? ` · Run ${runKm} km` : ""}
                  {event.notes ? (
                    <div className="muted">{event.notes}</div>
                  ) : null}
                  <div className="muted">By {event.actor}</div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

import { Link } from "react-router";
import {
  auditReceiptPath,
  formatAuditDetail,
} from "~/features/inventory/audit-display";
import { getAuditEvents } from "~/features/inventory/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/admin.audit";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return { events: await getAuditEvents() };
}

export default function AuditLogPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Audit log</h1>
          <p className="muted">
            Posted inventory events, reversals, purchases, and low-stock alerts.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Store</th>
                <th>Entity</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.events.length === 0 ? (
                <tr>
                  <td colSpan={6}>No audit events yet.</td>
                </tr>
              ) : (
                loaderData.events.map((event) => {
                  const receiptPath = auditReceiptPath(event);
                  return (
                    <tr key={event.id}>
                      <td>
                        {event.occurredAt
                          ? new Date(event.occurredAt).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <span className="mono">
                          {event.eventType.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{event.actor ?? "—"}</td>
                      <td>{event.store ?? "—"}</td>
                      <td>
                        {receiptPath ? (
                          <Link to={receiptPath}>View receipt</Link>
                        ) : (
                          <small>{event.entityType}</small>
                        )}
                      </td>
                      <td>{formatAuditDetail(event.metadata)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

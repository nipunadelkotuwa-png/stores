import { Form, Link, useSearchParams } from "react-router";
import { listJobCards } from "~/features/workshop/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.job-cards._index";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  return listJobCards(actor, {
    status:
      status === "OPEN" || status === "CLOSED" || status === "CANCELLED"
        ? status
        : undefined,
    bus: url.searchParams.get("bus") || undefined,
    start: url.searchParams.get("start") || undefined,
    end: url.searchParams.get("end") || undefined,
  });
}

export default function JobCardsPage({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workshop</p>
          <h1>Job cards</h1>
          <p className="muted">
            Open a job card when a bus enters the workshop. Parts, tyres, and
            oil can only be issued against an open card.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-primary" to="/job-cards/new">
            Open job card
          </Link>
        </div>
      </div>

      <Form className="form-panel panel" style={{ marginBottom: "1.5rem" }}>
        <div
          className="form-grid"
          style={{
            gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
            alignItems: "end",
          }}
        >
          <label>
            Status
            <select name="status" defaultValue={params.get("status") || ""}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>
            Bus number
            <input
              name="bus"
              placeholder="e.g. BUS-001"
              defaultValue={params.get("bus") || ""}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              name="start"
              defaultValue={params.get("start") || ""}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              name="end"
              defaultValue={params.get("end") || ""}
            />
          </label>
          <button className="button button-secondary" type="submit">
            Filter
          </button>
        </div>
      </Form>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Date</th>
                <th>Bus</th>
                <th>Store</th>
                <th>Complaint</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No job cards</strong>
                      <p>Open a card when a bus comes in for work.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                loaderData.map((card) => (
                  <tr key={card.id}>
                    <td className="mono">
                      <Link to={`/job-cards/${card.id}`}>{card.jobNumber}</Link>
                    </td>
                    <td>{card.businessDate}</td>
                    <td>
                      {card.fleetNumber}
                      {card.registrationNumber
                        ? ` — ${card.registrationNumber}`
                        : ""}
                    </td>
                    <td>
                      {card.storeCode} — {card.store}
                    </td>
                    <td>{card.complaint}</td>
                    <td>
                      <span
                        className={`badge ${card.status === "OPEN" ? "warning" : card.status === "CLOSED" ? "success" : ""}`}
                      >
                        {card.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

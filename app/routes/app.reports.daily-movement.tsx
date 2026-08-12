import { Form, useSubmit } from "react-router";
import { getDailyMovements } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.reports.daily-movement";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const date =
    url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const actor = await requireUser(request);
  const rows = await getDailyMovements(actor, date);
  return { date, rows };
}

export default function DailyMovementReport({
  loaderData,
}: Route.ComponentProps) {
  const submit = useSubmit();
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Daily Movement Report</h1>
        </div>
        <div>
          <button
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      <section className="panel no-print" style={{ marginBottom: "2rem" }}>
        <Form method="get" onChange={(e) => submit(e.currentTarget)}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <strong>Date:</strong>
              <input type="date" name="date" defaultValue={loaderData.date} />
            </label>
          </div>
        </Form>
      </section>

      <section className="panel print-panel">
        <h2 className="only-print">Daily Movement Report: {loaderData.date}</h2>
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #000" }}>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>
                  Document
                </th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Store</th>
                <th style={{ textAlign: "left", padding: "0.5rem" }}>Part</th>
                <th style={{ textAlign: "right", padding: "0.5rem" }}>
                  Movement
                </th>
                <th style={{ textAlign: "right", padding: "0.5rem" }}>
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    No movements recorded for this date.
                  </td>
                </tr>
              ) : (
                loaderData.rows.map((row, index) => (
                  <tr
                    key={`${row.id}-${index}`}
                    style={{ borderBottom: "1px solid #ccc" }}
                  >
                    <td style={{ padding: "0.5rem" }}>
                      <span className="mono">{row.number}</span>
                      <br />
                      <small>{row.type.replace("_", " ")}</small>
                    </td>
                    <td style={{ padding: "0.5rem" }}>{row.store}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <strong>{row.sku}</strong>
                      <br />
                      <small>{row.part}</small>
                    </td>
                    <td
                      style={{
                        padding: "0.5rem",
                        textAlign: "right",
                        color:
                          Number(row.delta) < 0
                            ? "var(--color-danger)"
                            : "var(--color-positive)",
                      }}
                    >
                      {Number(row.delta) > 0 ? "+" : ""}
                      {row.delta}
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "right" }}>
                      {row.balance}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .only-print { display: none; }
        @media print {
          .no-print { display: none !important; }
          .only-print { display: block; margin-bottom: 1rem; }
          body { background: white; padding: 0; }
          .panel { box-shadow: none; border: none; padding: 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
        }
      `,
        }}
      />
    </>
  );
}

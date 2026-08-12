import { data } from "react-router";
import { getDocumentForReceipt } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import type { Route } from "./+types/app.receipts.$id";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const doc = await getDocumentForReceipt(actor, params.id);
  if (!doc) {
    throw data("Receipt not found or you don't have permission to view it.", {
      status: 404,
    });
  }
  return { doc };
}

export default function ReceiptPage({ loaderData }: Route.ComponentProps) {
  const { doc } = loaderData;
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Transaction</p>
          <h1>Receipt {doc.number}</h1>
        </div>
        <div>
          <button
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print Receipt
          </button>
        </div>
      </div>

      <section
        className="panel receipt-panel"
        style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2>Store Management System</h2>
          <p>
            {doc.storeCode} - {doc.store}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "2rem",
          }}
        >
          <div>
            <p>
              <strong>Document Number:</strong> {doc.number}
            </p>
            <p>
              <strong>Type:</strong> {doc.type.replace("_", " ")}
            </p>
            <p>
              <strong>Date:</strong> {doc.date}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            {doc.bus ? (
              <p>
                <strong>Bus:</strong> {doc.bus}
              </p>
            ) : null}
            <p>
              <strong>Posted At:</strong>{" "}
              {doc.postedAt ? new Date(doc.postedAt).toLocaleString() : "N/A"}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #000" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>SKU</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>
                  Description
                </th>
                <th style={{ textAlign: "right", padding: "0.5rem 0" }}>Qty</th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "0.5rem 0",
                    paddingLeft: "0.5rem",
                  }}
                >
                  Unit
                </th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ccc" }}>
                  <td style={{ padding: "0.5rem 0" }} className="mono">
                    {line.sku}
                  </td>
                  <td style={{ padding: "0.5rem 0" }}>{line.name}</td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                    {line.quantity}
                  </td>
                  <td style={{ padding: "0.5rem 0", paddingLeft: "0.5rem" }}>
                    {line.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {doc.reason && (
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1rem",
              borderTop: "1px solid #eee",
            }}
          >
            <p>
              <strong>Reason / Remarks:</strong> {doc.reason}
            </p>
          </div>
        )}

        <div
          style={{
            marginTop: "4rem",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div style={{ textAlign: "center", width: "200px" }}>
            <div
              style={{ borderBottom: "1px solid #000", height: "40px" }}
            ></div>
            <p style={{ marginTop: "0.5rem" }}>Issued / Received By</p>
          </div>
          <div style={{ textAlign: "center", width: "200px" }}>
            <div
              style={{ borderBottom: "1px solid #000", height: "40px" }}
            ></div>
            <p style={{ marginTop: "0.5rem" }}>Authorized Signatory</p>
          </div>
        </div>
      </section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white; padding: 0; }
          .panel { box-shadow: none; border: none; }
        }
      `,
        }}
      />
    </>
  );
}

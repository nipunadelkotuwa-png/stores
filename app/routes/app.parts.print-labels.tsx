import { Link } from "react-router";
import QRCode from "react-qr-code";
import { db } from "~/db/client.server";
import { parts, partCategories } from "~/db/schema";
import { eq, asc } from "drizzle-orm";
import type { Route } from "./+types/app.parts.print-labels";
import { requireUser } from "~/lib/auth/authorization.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const allParts = await db
    .select({
      id: parts.id,
      sku: parts.sku,
      name: parts.name,
      barcode: parts.barcode,
      category: partCategories.name,
    })
    .from(parts)
    .innerJoin(partCategories, eq(parts.categoryId, partCategories.id))
    .where(eq(parts.active, true))
    .orderBy(asc(parts.sku));
  return { parts: allParts };
}

export default function PrintLabelsPage({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Print Part Labels</h1>
          <p className="muted">QR code labels for inventory bins and parts.</p>
        </div>
        <div className="heading-actions">
          <Link to="/parts" className="button button-secondary">
            Back to Parts
          </Link>
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.print()}
          >
            Print Labels
          </button>
        </div>
      </div>

      <div className="labels-grid">
        {loaderData.parts.map((part) => {
          // If no barcode is defined, we'll use the SKU as the QR code value.
          const qrValue = part.barcode || part.sku;
          return (
            <div key={part.id} className="label-card">
              <div className="label-qr">
                <QRCode value={qrValue} size={120} level="M" />
              </div>
              <div className="label-info">
                <strong>{part.sku}</strong>
                <p>{part.name}</p>
                <span>{part.category}</span>
                <span className="mono">{qrValue}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

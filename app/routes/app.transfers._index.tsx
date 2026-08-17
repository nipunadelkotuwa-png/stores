import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { workshopActionError } from "~/features/workshop/errors";
import { receiveStoreTransfer } from "~/features/inventory/transfers.server";
import { getInTransitTransfers } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.transfers._index";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  return { inTransit: await getInTransitTransfers(actor) };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  try {
    await receiveStoreTransfer(actor, {
      documentId: String(formData.get("documentId") ?? ""),
      businessDate: String(formData.get("businessDate") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
    return { ok: true };
  } catch (error) {
    return { error: workshopActionError(error, "Unable to receive transfer") };
  }
}

export default function TransfersPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Locations</p>
          <h1>Transfers</h1>
          <p className="muted">
            Stock leaves the source on send and arrives when the destination
            receives it. Tyre serials stay in transit until received.
          </p>
        </div>
        <div className="heading-actions">
          <Link className="button button-primary" to="/transfers/new">
            New transfer
          </Link>
          <Link className="button button-secondary" to="/reports/transfers">
            Transfer report
          </Link>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData?.ok ? <p className="muted">Transfer received.</p> : null}

      <section className="panel">
        <h2>In transit</h2>
        {loaderData.inTransit.length === 0 ? (
          <div className="empty-state">
            <strong>Nothing on the truck</strong>
            <p>
              Sent transfers appear here until the destination receives them.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Date</th>
                  <th>Serials</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loaderData.inTransit.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">
                      <Link to={`/receipts/${row.id}`}>{row.number}</Link>
                    </td>
                    <td>
                      {row.sourceCode} — {row.source}
                    </td>
                    <td>
                      {row.destinationCode} — {row.destination}
                    </td>
                    <td>{row.date}</td>
                    <td>
                      {row.serials.length === 0
                        ? "—"
                        : row.serials
                            .map((serial) => serial.serialNumber)
                            .join(", ")}
                    </td>
                    <td>
                      {row.canReceive ? (
                        <Form method="post">
                          <CsrfField />
                          <input
                            type="hidden"
                            name="documentId"
                            value={row.id}
                          />
                          <input
                            type="hidden"
                            name="businessDate"
                            value={today}
                          />
                          <input
                            type="hidden"
                            name="idempotencyKey"
                            value={`tri-${row.id}`}
                          />
                          <button
                            className="button button-secondary"
                            disabled={navigation.state !== "idle"}
                          >
                            Receive
                          </button>
                        </Form>
                      ) : (
                        <span className="muted">Awaiting destination</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

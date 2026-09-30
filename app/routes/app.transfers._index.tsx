import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import { workshopActionError } from "~/features/workshop/errors";
import {
  receiveStoreTransfer,
  voidStoreTransfer,
} from "~/features/inventory/transfers.server";
import { getInTransitTransfers } from "~/features/inventory/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { can } from "~/lib/auth/permissions";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.transfers._index";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "reports.read");
  return {
    inTransit: await getInTransitTransfers(actor),
    canCreate: can(actor.role, "transfers.create"),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "transfers.create");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "receive");
  try {
    if (intent === "void") {
      await voidStoreTransfer(actor, {
        documentId: String(formData.get("documentId") ?? ""),
        businessDate: String(formData.get("businessDate") ?? ""),
        reason: String(formData.get("reason") ?? "Transfer never arrived"),
        idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      });
      return { ok: true, voided: true };
    }
    await receiveStoreTransfer(actor, {
      documentId: String(formData.get("documentId") ?? ""),
      businessDate: String(formData.get("businessDate") ?? ""),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    });
    return { ok: true };
  } catch (error) {
    return {
      error: workshopActionError(
        error,
        intent === "void"
          ? "Unable to void transfer"
          : "Unable to receive transfer",
      ),
    };
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
          {loaderData.canCreate ? (
            <Link className="button button-primary" to="/transfers/new">
              New transfer
            </Link>
          ) : null}
          <Link className="button button-secondary" to="/reports/transfers">
            Transfer report
          </Link>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData?.ok ? (
        <p className="muted">
          {"voided" in actionData && actionData.voided
            ? "Transfer voided. Source stock restored."
            : "Transfer received."}
        </p>
      ) : null}

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
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {loaderData.canCreate && row.canReceive ? (
                          <Form method="post">
                            <CsrfField />
                            <input
                              type="hidden"
                              name="intent"
                              value="receive"
                            />
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
                        ) : loaderData.canCreate ? (
                          <span className="muted">Awaiting destination</span>
                        ) : null}
                        {loaderData.canCreate && row.canVoid ? (
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  "Void this transfer and restore source stock?",
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <CsrfField />
                            <input type="hidden" name="intent" value="void" />
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
                              name="reason"
                              value="Transfer never arrived"
                            />
                            <input
                              type="hidden"
                              name="idempotencyKey"
                              value={`trv-${row.id}`}
                            />
                            <button
                              className="text-button"
                              disabled={navigation.state !== "idle"}
                            >
                              Void
                            </button>
                          </Form>
                        ) : null}
                      </div>
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

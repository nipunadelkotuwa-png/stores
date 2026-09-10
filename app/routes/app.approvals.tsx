import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import {
  approvePendingIssue,
  inventoryActionError,
  rejectPendingIssue,
} from "~/features/inventory/posting.server";
import { getPendingIssues } from "~/features/inventory/queries.server";
import {
  approveJobCard,
  rejectJobCard,
} from "~/features/workshop/job-cards.server";
import { ZodError } from "zod";
import {
  WorkshopError,
  workshopActionResult,
} from "~/features/workshop/errors";
import { isSerializationFailure } from "~/lib/postgres-error";
import { getPendingJobCards } from "~/features/workshop/queries.server";
import { requirePermission } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.approvals";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requirePermission(request, "approvals.manage");
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") === "issues" ? "issues" : "job-cards";
  const [jobCards, issues] = await Promise.all([
    getPendingJobCards(actor),
    getPendingIssues(actor),
  ]);
  return { tab, jobCards, issues };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requirePermission(request, "approvals.manage");
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  try {
    if (intent === "approve-job-card") {
      await approveJobCard(actor, String(formData.get("jobCardId") ?? ""));
      return { ok: "job-card-approved" as const };
    }
    if (intent === "reject-job-card") {
      await rejectJobCard(actor, {
        jobCardId: String(formData.get("jobCardId") ?? ""),
        reason: String(formData.get("reason") ?? ""),
      });
      return { ok: "job-card-rejected" as const };
    }
    if (intent === "approve") {
      await approvePendingIssue(
        actor,
        String(formData.get("documentId") ?? ""),
      );
      return { ok: "issue-verified" as const };
    }
    if (intent === "reject") {
      await rejectPendingIssue(
        actor,
        String(formData.get("documentId") ?? ""),
        String(formData.get("reason") ?? ""),
      );
      return { ok: "issue-rejected" as const };
    }
    return { error: "Unknown action" };
  } catch (error) {
    if (error instanceof Response) throw error;
    if (
      error instanceof WorkshopError ||
      error instanceof ZodError ||
      isSerializationFailure(error)
    ) {
      return workshopActionResult(error, "Unable to update approval");
    }
    return {
      error: inventoryActionError(error, "Unable to update approval"),
    };
  }
}

export default function ApprovalsPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const grouped = new Map<string, (typeof loaderData.issues)[number][]>();
  for (const row of loaderData.issues) {
    const list = grouped.get(row.id) ?? [];
    list.push(row);
    grouped.set(row.id, list);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Approvals</p>
          <h1>Approvals Center</h1>
          <p className="muted">
            Approve job cards for work, then verify item issues before stock is
            deducted.
          </p>
        </div>
      </div>

      <div
        className="heading-actions"
        style={{ marginBottom: "1rem", gap: "0.5rem" }}
      >
        <Link
          className={`button ${loaderData.tab === "job-cards" ? "button-primary" : "button-secondary"}`}
          to="/approvals?tab=job-cards"
        >
          Job Cards ({loaderData.jobCards.length})
        </Link>
        <Link
          className={`button ${loaderData.tab === "issues" ? "button-primary" : "button-secondary"}`}
          to="/approvals?tab=issues"
        >
          Item Issues ({grouped.size})
        </Link>
      </div>

      {actionData && "error" in actionData ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "job-card-approved" ? (
        <p className="muted">Job card approved for work.</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "job-card-rejected" ? (
        <p className="muted">Job card rejected.</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "issue-verified" ? (
        <p className="muted">Item issue verified and posted.</p>
      ) : null}
      {actionData && "ok" in actionData && actionData.ok === "issue-rejected" ? (
        <p className="muted">Item issue rejected.</p>
      ) : null}

      {loaderData.tab === "job-cards" ? (
        <section className="panel">
          {loaderData.jobCards.length === 0 ? (
            <div className="empty-state">
              <strong>No pending job cards</strong>
              <p>New job cards appear here until an operator approves them.</p>
            </div>
          ) : (
            <div className="stack" style={{ gap: "1.5rem" }}>
              {loaderData.jobCards.map((card) => (
                <article
                  key={card.id}
                  className="panel"
                  style={{ padding: "1rem" }}
                >
                  <div
                    className="page-heading"
                    style={{ marginBottom: "0.75rem" }}
                  >
                    <div>
                      <Link to={`/job-cards/${card.id}`} className="mono">
                        {card.jobNumber}
                      </Link>
                      <p className="muted">
                        {card.fleetNumber}
                        {card.registrationNumber
                          ? ` · ${card.registrationNumber}`
                          : ""}{" "}
                        · {card.storeCode} · {card.businessDate}
                        {card.odometerKm ? ` · ${card.odometerKm} km` : ""}
                      </p>
                      <p>{card.complaint}</p>
                      <p className="muted">
                        Mechanic: {card.mechanicName || "—"} · Created by{" "}
                        {card.createdBy} ·{" "}
                        {new Date(card.openedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="badge warning">Pending approval</span>
                  </div>
                  <div
                    style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
                  >
                    <Form method="post">
                      <CsrfField />
                      <input type="hidden" name="jobCardId" value={card.id} />
                      <input
                        type="hidden"
                        name="intent"
                        value="approve-job-card"
                      />
                      <button className="button button-primary" disabled={busy}>
                        Approve Job Card
                      </button>
                    </Form>
                    <Form method="post" className="stack" style={{ flex: 1 }}>
                      <CsrfField />
                      <input type="hidden" name="jobCardId" value={card.id} />
                      <input
                        type="hidden"
                        name="intent"
                        value="reject-job-card"
                      />
                      <input
                        name="reason"
                        required
                        minLength={3}
                        placeholder="Rejection reason"
                      />
                      <button
                        className="button button-secondary"
                        disabled={busy}
                      >
                        Reject
                      </button>
                    </Form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          {grouped.size === 0 ? (
            <div className="empty-state">
              <strong>No pending item issues</strong>
              <p>
                Submitted bus issues appear here until an operator verifies
                them.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: "1.5rem" }}>
              {[...grouped.entries()].map(([id, lines]) => {
                const header = lines[0];
                return (
                  <article
                    key={id}
                    className="panel"
                    style={{ padding: "1rem" }}
                  >
                    <div
                      className="page-heading"
                      style={{ marginBottom: "0.75rem" }}
                    >
                      <div>
                        <Link to={`/receipts/${id}`} className="mono">
                          {header.number}
                        </Link>
                        <p className="muted">
                          {header.storeCode} · {header.fleetNumber ?? "Bus"} ·{" "}
                          {header.date} · Store Keeper: {header.createdBy}
                          {header.jobNumber ? (
                            <>
                              {" "}
                              · Job card{" "}
                              <Link to={`/job-cards/${header.jobCardId}`}>
                                {header.jobNumber}
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </div>
                      {header.lastApprovalError ? (
                        <span className="badge danger">
                          {header.lastApprovalError}
                        </span>
                      ) : (
                        <span className="badge warning">
                          Pending verification
                        </span>
                      )}
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Item</th>
                            <th>Requested</th>
                            <th>On hand</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, index) => (
                            <tr key={`${id}-${index}`}>
                              <td className="mono">{line.sku}</td>
                              <td>{line.part}</td>
                              <td className="quantity">{line.quantity}</td>
                              <td className="quantity">{line.onHand}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <Form method="post">
                        <CsrfField />
                        <input type="hidden" name="documentId" value={id} />
                        <input type="hidden" name="intent" value="approve" />
                        <button
                          className="button button-primary"
                          disabled={busy}
                        >
                          {header.lastApprovalError
                            ? "Retry verify"
                            : "Verify & Post"}
                        </button>
                      </Form>
                      <Form method="post" className="stack" style={{ flex: 1 }}>
                        <CsrfField />
                        <input type="hidden" name="documentId" value={id} />
                        <input type="hidden" name="intent" value="reject" />
                        <input
                          name="reason"
                          required
                          minLength={3}
                          placeholder="Rejection reason"
                        />
                        <button
                          className="button button-secondary"
                          disabled={busy}
                        >
                          Reject
                        </button>
                      </Form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}

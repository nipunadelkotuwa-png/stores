import { Form, Link, useActionData, useNavigation } from "react-router";
import { CsrfField } from "~/components/csrf-field";
import {
  approvePendingIssue,
  inventoryActionError,
  rejectPendingIssue,
} from "~/features/inventory/posting.server";
import { getPendingIssues } from "~/features/inventory/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.approvals";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireAdmin(request);
  return { rows: await getPendingIssues(actor) };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const intent = String(formData.get("intent") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  try {
    if (intent === "approve") {
      await approvePendingIssue(actor, documentId);
      return { ok: "approved" as const };
    }
    if (intent === "reject") {
      await rejectPendingIssue(
        actor,
        documentId,
        String(formData.get("reason") ?? ""),
      );
      return { ok: "rejected" as const };
    }
    return { error: "Unknown action" };
  } catch (error) {
    return {
      error: inventoryActionError(error, "Unable to update approval"),
    };
  }
}

export default function ApprovalsPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const grouped = new Map<string, (typeof loaderData.rows)[number][]>();
  for (const row of loaderData.rows) {
    const list = grouped.get(row.id) ?? [];
    list.push(row);
    grouped.set(row.id, list);
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Approvals</p>
          <h1>Pending bus issues</h1>
          <p className="muted">
            Approve to post stock, or reject with a reason. Failed approvals
            stay pending.
          </p>
        </div>
      </div>
      {actionData?.error ? (
        <p className="form-error">{actionData.error}</p>
      ) : null}
      {actionData?.ok === "approved" ? (
        <p className="muted">Issue posted.</p>
      ) : null}
      {actionData?.ok === "rejected" ? (
        <p className="muted">Issue rejected.</p>
      ) : null}

      <section className="panel">
        {grouped.size === 0 ? (
          <div className="empty-state">
            <strong>No pending issues</strong>
            <p>
              Standalone bus issues appear here until an admin approves them.
            </p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "1.5rem" }}>
            {[...grouped.entries()].map(([id, lines]) => {
              const header = lines[0];
              return (
                <article key={id} className="panel" style={{ padding: "1rem" }}>
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
                        {header.date} · {header.createdBy}
                      </p>
                    </div>
                    {header.lastApprovalError ? (
                      <span className="badge danger">
                        {header.lastApprovalError}
                      </span>
                    ) : (
                      <span className="badge warning">Pending</span>
                    )}
                  </div>
                  <ul>
                    {lines.map((line, index) => (
                      <li key={`${id}-${index}`}>
                        {line.sku} — {line.part} × {line.quantity}
                      </li>
                    ))}
                  </ul>
                  <div
                    style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
                  >
                    <Form method="post">
                      <CsrfField />
                      <input type="hidden" name="documentId" value={id} />
                      <input type="hidden" name="intent" value="approve" />
                      <button className="button button-primary" disabled={busy}>
                        {header.lastApprovalError ? "Retry approve" : "Approve"}
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
    </>
  );
}

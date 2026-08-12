import { useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import {
  inventoryActionError,
  postReversal,
} from "~/features/inventory/posting.server";
import { getPostedDocumentsForReversal } from "~/features/inventory/queries.server";
import { requireUser } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.returns";

const reversalSchema = z.object({
  documentId: z.string().uuid(),
  businessDate: z.string().date(),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(16),
});

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireUser(request);
  const documents = await getPostedDocumentsForReversal(actor);
  return { documents };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const entries = Object.fromEntries(formData);

  try {
    const parsed = reversalSchema.safeParse(entries);
    if (!parsed.success) return { error: "Invalid return details." };
    const result = await postReversal(actor, parsed.data);
    throw redirect(`/receipts/${result.id}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to post return"),
    };
  }
}

export default function ReturnsPage({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const [reverseKey] = useState(() => crypto.randomUUID());

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Inventory operations</p>
          <h1>Returns & Reversals</h1>
          <p className="muted">
            Return issued items or reverse incorrect stock receipts.
          </p>
        </div>
      </div>
      {data?.error ? <p className="form-error">{data.error}</p> : null}
      <section className="panel form-panel">
        <h2>Process Return / Reversal</h2>
        <Form method="post" className="stack">
          <CsrfField />
          <input type="hidden" name="idempotencyKey" value={reverseKey} />
          <label>
            Original Document
            <select name="documentId" required>
              <option value="">Select document to return/reverse</option>
              {loaderData.documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.number} · {doc.type.replace("_", " ")} · {doc.store} ·{" "}
                  {doc.date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Business date
            <input
              type="date"
              name="businessDate"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Reason for return
            <textarea
              name="reason"
              required
              rows={3}
              placeholder="e.g. Bus did not need the part, defective item returned to supplier"
            />
          </label>
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            Post Return
          </button>
        </Form>
      </section>
    </>
  );
}

import { useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { StockLineItems } from "~/components/stock-line-items";
import {
  formatZodLineError,
  loadStockLines,
  MAX_STOCK_LINES,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  postReversal,
  postStock,
} from "~/features/inventory/posting.server";
import {
  getPostedDocumentsForReversal,
  getTransactionOptions,
} from "~/features/inventory/queries.server";
import { requireAdmin } from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/admin.corrections";

const adjustmentSchema = z.object({
  intent: z.literal("adjust"),
  storeId: z.string().uuid(),
  businessDate: z.string().date(),
  direction: z.enum(["increase", "decrease"]),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(16),
  lines: z
    .array(
      z.object({
        partId: z.string().uuid(),
        quantity: z
          .string()
          .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be a positive decimal"),
      }),
    )
    .min(1)
    .max(MAX_STOCK_LINES),
});

const reversalSchema = z.object({
  intent: z.literal("reverse"),
  documentId: z.string().uuid(),
  businessDate: z.string().date(),
  reason: z.string().min(3).max(500),
  idempotencyKey: z.string().min(16),
});

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await requireAdmin(request);
  const [options, documents] = await Promise.all([
    getTransactionOptions(actor),
    getPostedDocumentsForReversal(actor),
  ]);
  return { options, documents };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireAdmin(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const entries = Object.fromEntries(formData);
  try {
    if (entries.intent === "adjust") {
      const loaded = loadStockLines(formData);
      if (!loaded.ok) {
        return { error: loaded.error, lineErrors: loaded.lineErrors };
      }
      const parsed = adjustmentSchema.safeParse({
        ...entries,
        lines: loaded.lines,
      });
      if (!parsed.success) {
        const failure = formatZodLineError(parsed.error, loaded.lines);
        return { error: failure.error, lineErrors: failure.lineErrors };
      }
      try {
        const result = await postStock(actor, "ADJUSTMENT", {
          storeId: parsed.data.storeId,
          businessDate: parsed.data.businessDate,
          direction: parsed.data.direction,
          reason: parsed.data.reason,
          idempotencyKey: parsed.data.idempotencyKey,
          lines: parsed.data.lines,
        });
        throw redirect(`/reports/movements?posted=${result.number}`);
      } catch (error) {
        if (error instanceof Response) throw error;
        const failure = stockLinesActionError(
          error,
          "Unable to post correction",
          loaded.lines,
          inventoryActionError,
        );
        return { error: failure.error, lineErrors: failure.lineErrors };
      }
    }
    if (entries.intent === "reverse") {
      const parsed = reversalSchema.safeParse(entries);
      if (!parsed.success) return { error: "Invalid reversal details." };
      const result = await postReversal(actor, parsed.data);
      throw redirect(`/reports/movements?posted=${result.number}`);
    }
    return { error: "Unknown correction intent." };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      error: inventoryActionError(error, "Unable to post correction"),
    };
  }
}

export default function CorrectionsPage({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const [adjustKey] = useState(() => crypto.randomUUID());
  const [reverseKey] = useState(() => crypto.randomUUID());
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>Inventory corrections</h1>
          <p className="muted">
            Admin-only adjustments and reversals. Posted history is never
            edited.
          </p>
        </div>
      </div>
      {data?.error ? <p className="form-error">{data.error}</p> : null}
      <div className="two-column">
        <section className="panel form-panel">
          <h2>Stock adjustment</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="adjust" />
            <input type="hidden" name="idempotencyKey" value={adjustKey} />
            <label>
              Store
              <select name="storeId" required>
                <option value="">Select store</option>
                {loaderData.options.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.code} — {store.name}
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
              Direction
              <select name="direction" required defaultValue="increase">
                <option value="increase">Increase on-hand</option>
                <option value="decrease">Decrease on-hand</option>
              </select>
            </label>
            <StockLineItems
              parts={loaderData.options.parts}
              lineErrors={data?.lineErrors}
            />
            <label>
              Reason
              <textarea name="reason" required rows={3} />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Post adjustment
            </button>
          </Form>
        </section>
        <section className="panel form-panel">
          <h2>Reverse posted document</h2>
          <Form method="post" className="stack">
            <CsrfField />
            <input type="hidden" name="intent" value="reverse" />
            <input type="hidden" name="idempotencyKey" value={reverseKey} />
            <label>
              Document
              <select name="documentId" required>
                <option value="">Select document</option>
                {loaderData.documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.number} · {doc.type} · {doc.store} · {doc.date}
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
              Reason
              <textarea name="reason" required rows={3} />
            </label>
            <button
              className="button button-primary"
              disabled={navigation.state !== "idle"}
            >
              Post reversal
            </button>
          </Form>
        </section>
      </div>
    </>
  );
}

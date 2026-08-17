import Decimal from "decimal.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import { useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { StockLineItems } from "~/components/stock-line-items";
import { db } from "~/db/client.server";
import {
  auditEvents,
  localPurchaseLines,
  localPurchases,
  parts,
} from "~/db/schema";
import {
  formatZodLineError,
  loadStockLines,
  stockLinesActionError,
} from "~/features/inventory/form-lines";
import {
  inventoryActionError,
  postStockInTransaction,
  prepareStockCommand,
} from "~/features/inventory/posting.server";
import { getTransactionOptions } from "~/features/inventory/queries.server";
import {
  requireStoreAccess,
  requireUser,
} from "~/lib/auth/authorization.server";
import { requireValidCsrf } from "~/lib/csrf.server";
import type { Route } from "./+types/app.purchases.new";

const purchaseLineSchema = z.object({
  partId: z.string().uuid(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be a positive decimal")
    .refine((value) => Number(value) > 0, "Quantity must be positive"),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Unit price must be a non-negative decimal"),
});

const schema = z.object({
  storeId: z.string().uuid(),
  supplierId: z.string().uuid(),
  businessDate: z.string().date(),
  invoiceReference: z.string().optional(),
  idempotencyKey: z.string().min(16),
  lines: z.array(purchaseLineSchema).min(1).max(100),
});

export async function loader({ request }: Route.LoaderArgs) {
  return getTransactionOptions(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const loaded = loadStockLines(formData, "unitPrice");
  if (!loaded.ok) {
    return { error: loaded.error, lineErrors: loaded.lineErrors };
  }
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    lines: loaded.lines,
  });
  if (!parsed.success) {
    const failure = formatZodLineError(parsed.error, loaded.lines);
    return { error: failure.error, lineErrors: failure.lineErrors };
  }
  const value = parsed.data;
  await requireStoreAccess(actor, value.storeId);
  const supplier = await db.query.suppliers.findFirst({
    where: (row, { eq }) => eq(row.id, value.supplierId),
  });
  const partIds = [...new Set(value.lines.map((line) => line.partId))];
  const partRows = await db
    .select()
    .from(parts)
    .where(inArray(parts.id, partIds));
  const partById = new Map(partRows.map((part) => [part.id, part]));
  if (!supplier || partById.size !== partIds.length)
    return { error: "Supplier or part no longer exists." };
  const lineTotals = value.lines.map((line) =>
    new Decimal(line.quantity).times(line.unitPrice).toDecimalPlaces(2),
  );
  const subtotal = lineTotals
    .reduce((sum, amount) => sum.plus(amount), new Decimal(0))
    .toDecimalPlaces(2);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const existing = await tx
        .select({
          id: localPurchases.id,
          number: localPurchases.purchaseNumber,
          receiptId: localPurchases.receiptDocumentId,
        })
        .from(localPurchases)
        .where(
          and(
            eq(localPurchases.createdBy, actor.id),
            eq(localPurchases.idempotencyKey, value.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0];

      const number = `LPO-${value.businessDate.replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const [purchase] = await tx
        .insert(localPurchases)
        .values({
          purchaseNumber: number,
          storeId: value.storeId,
          supplierId: value.supplierId,
          supplierNameSnapshot: supplier.name,
          supplierInvoiceReference: value.invoiceReference,
          businessDate: value.businessDate,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          status: "DRAFT",
          idempotencyKey: value.idempotencyKey,
          createdBy: actor.id,
        })
        .returning();
      await tx.insert(localPurchaseLines).values(
        value.lines.map((line, index) => {
          const part = partById.get(line.partId)!;
          return {
            purchaseId: purchase.id,
            lineNumber: index + 1,
            partId: part.id,
            quantity: new Decimal(line.quantity).toFixed(3),
            unitPrice: new Decimal(line.unitPrice).toFixed(2),
            lineTotal: lineTotals[index]!.toFixed(2),
            skuSnapshot: part.sku,
            nameSnapshot: part.name,
            unitSnapshot: part.unit,
          };
        }),
      );
      const receipt = await postStockInTransaction(
        tx,
        actor,
        "STOCK_RECEIPT",
        prepareStockCommand("STOCK_RECEIPT", {
          storeId: value.storeId,
          supplierId: value.supplierId,
          businessDate: value.businessDate,
          idempotencyKey: `receipt-${value.idempotencyKey}`,
          lines: value.lines.map((line) => ({
            partId: line.partId,
            quantity: line.quantity,
            unitCost: line.unitPrice,
          })),
        }),
      );
      await tx
        .update(localPurchases)
        .set({
          status: "POSTED",
          receiptDocumentId: receipt.id,
          postedBy: actor.id,
          postedAt: new Date(),
        })
        .where(eq(localPurchases.id, purchase.id));
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        eventType: "LOCAL_PURCHASE_POSTED",
        entityType: "local_purchase",
        entityId: purchase.id,
        storeId: value.storeId,
        metadata: { purchaseNumber: number, receiptNumber: receipt.number },
      });
      return { id: purchase.id, number, receiptId: receipt.id };
    });
    if (result.receiptId) throw redirect(`/receipts/${result.receiptId}`);
    throw redirect(`/reports/movements?purchase=${result.number}`);
  } catch (error) {
    if (error instanceof Response) throw error;
    const failure = stockLinesActionError(
      error,
      "Unable to post purchase",
      loaded.lines,
      inventoryActionError,
    );
    return { error: failure.error, lineErrors: failure.lineErrors };
  }
}

export default function PurchasePage({ loaderData }: Route.ComponentProps) {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Local procurement</p>
          <h1>Record local purchase</h1>
          <p className="muted">
            Post a purchase and add its quantity to store inventory.
          </p>
        </div>
      </div>
      <Form method="post" className="panel transaction-form">
        <CsrfField />
        <input type="hidden" name="idempotencyKey" value={key} />
        <div className="form-grid">
          <label>
            Store
            <select name="storeId" required>
              <option value="">Select store</option>
              {loaderData.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Supplier
            <select name="supplierId" required>
              <option value="">Select supplier</option>
              {loaderData.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Business date
            <input
              name="businessDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Supplier invoice
            <input name="invoiceReference" />
          </label>
        </div>
        <StockLineItems
          parts={loaderData.parts}
          lineErrors={data?.lineErrors}
          cost={{
            name: "unitPrice",
            label: "Unit price (LKR)",
            required: true,
          }}
        />
        {data?.error ? <p className="form-error">{data.error}</p> : null}
        <div className="form-actions">
          <button
            className="button button-primary"
            disabled={navigation.state !== "idle"}
          >
            {navigation.state === "submitting"
              ? "Posting…"
              : "Post local purchase"}
          </button>
        </div>
      </Form>
    </>
  );
}

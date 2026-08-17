import Decimal from "decimal.js";
import { and, eq, sql } from "drizzle-orm";
import { useState } from "react";
import { Form, redirect, useActionData, useNavigation } from "react-router";
import { z } from "zod";
import { CsrfField } from "~/components/csrf-field";
import { PartSelector } from "~/components/part-selector";
import { db } from "~/db/client.server";
import { auditEvents, localPurchaseLines, localPurchases } from "~/db/schema";
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

const schema = z.object({
  storeId: z.string().uuid(),
  supplierId: z.string().uuid(),
  businessDate: z.string().date(),
  partId: z.string().uuid(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, "Quantity must be a positive decimal")
    .refine((value) => Number(value) > 0, "Quantity must be positive"),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Unit price must be a non-negative decimal"),
  invoiceReference: z.string().optional(),
  idempotencyKey: z.string().min(16),
});

export async function loader({ request }: Route.LoaderArgs) {
  return getTransactionOptions(await requireUser(request));
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const formData = await request.formData();
  await requireValidCsrf(request, formData);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Complete all purchase fields with valid values." };
  const value = parsed.data;
  await requireStoreAccess(actor, value.storeId);
  const supplier = await db.query.suppliers.findFirst({
    where: (row, { eq }) => eq(row.id, value.supplierId),
  });
  const part = await db.query.parts.findFirst({
    where: (row, { eq }) => eq(row.id, value.partId),
  });
  if (!supplier || !part)
    return { error: "Supplier or part no longer exists." };
  const subtotal = new Decimal(value.quantity)
    .times(value.unitPrice)
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
      await tx.insert(localPurchaseLines).values({
        purchaseId: purchase.id,
        lineNumber: 1,
        partId: part.id,
        quantity: new Decimal(value.quantity).toFixed(3),
        unitPrice: new Decimal(value.unitPrice).toFixed(2),
        lineTotal: subtotal.toFixed(2),
        skuSnapshot: part.sku,
        nameSnapshot: part.name,
        unitSnapshot: part.unit,
      });
      const receipt = await postStockInTransaction(
        tx,
        actor,
        "STOCK_RECEIPT",
        prepareStockCommand("STOCK_RECEIPT", {
          storeId: value.storeId,
          supplierId: value.supplierId,
          businessDate: value.businessDate,
          idempotencyKey: `receipt-${value.idempotencyKey}`,
          lines: [
            {
              partId: value.partId,
              quantity: value.quantity,
              unitCost: value.unitPrice,
            },
          ],
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
    return {
      error: inventoryActionError(error, "Unable to post purchase"),
    };
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
          <label>
            Part
            <PartSelector name="partId" parts={loaderData.parts} required />
          </label>
          <label>
            Quantity
            <input
              name="quantity"
              type="number"
              min="0.001"
              step="0.001"
              required
            />
          </label>
          <label>
            Unit price (LKR)
            <input
              name="unitPrice"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </label>
        </div>
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

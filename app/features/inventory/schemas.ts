import { z } from "zod";

const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const normalized = String(value).trim();
    if (!/^\d+(\.\d{1,3})?$/.test(normalized) || Number(normalized) <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Quantity must be a positive decimal",
      });
      return z.NEVER;
    }
    return normalized;
  });

const optionalCostSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "") return undefined;
    const normalized = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
      ctx.addIssue({
        code: "custom",
        message: "Unit cost must be a non-negative decimal",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const stockLineSchema = z.object({
  partId: z.string().uuid(),
  quantity: quantitySchema,
  unitCost: optionalCostSchema,
});

export const postStockSchema = z.object({
  storeId: z.string().uuid(),
  businessDate: z.string().date(),
  busId: z.string().uuid().optional(),
  jobCardId: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().uuid().optional(),
  ),
  supplierId: z.string().uuid().optional(),
  destinationStoreId: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().uuid().optional(),
  ),
  linkedDocumentId: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().uuid().optional(),
  ),
  tyreIds: z.preprocess((value) => {
    if (value === undefined || value === "") return undefined;
    if (Array.isArray(value)) return value;
    return [value];
  }, z.array(z.string().uuid()).optional()),
  /** ADJUSTMENT only: increase (default) or decrease on-hand. */
  direction: z.enum(["increase", "decrease"]).optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
  lines: z.array(stockLineSchema).min(1).max(100),
});

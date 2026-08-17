import { z } from "zod";
import { TYRE_POSITIONS, TYRE_STAGES } from "./constants";

const optionalKmSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === "") return undefined;
    const normalized = String(value).trim();
    if (!/^\d+(\.\d{1,1})?$/.test(normalized)) {
      ctx.addIssue({
        code: "custom",
        message: "Odometer must be a non-negative number",
      });
      return z.NEVER;
    }
    return normalized;
  });

const litresSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const normalized = String(value).trim();
    if (!/^\d+(\.\d{1,3})?$/.test(normalized) || Number(normalized) <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Litres must be a positive decimal",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const openJobCardSchema = z.object({
  storeId: z.string().uuid(),
  busId: z.string().uuid(),
  businessDate: z.string().date(),
  odometerKm: optionalKmSchema,
  complaint: z.string().trim().min(3).max(2000),
  mechanicName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const closeJobCardSchema = z.object({
  jobCardId: z.string().uuid(),
  workDone: z.string().trim().min(3).max(2000),
});

export const registerTyreSchema = z.object({
  storeId: z.string().uuid(),
  partId: z.string().uuid(),
  serialNumber: z.string().trim().min(2).max(80),
  lifecycleStage: z.enum(TYRE_STAGES).default("ORG"),
  notes: z.string().trim().max(1000).optional(),
});

export const fitTyreSchema = z.object({
  jobCardId: z.string().uuid(),
  tyreId: z.string().uuid(),
  position: z.enum(TYRE_POSITIONS),
  idempotencyKey: z.string().min(16).max(100),
});

export const sendTyreToDagSchema = z.object({
  tyreId: z.string().uuid(),
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
});

export const receiveTyreFromDagSchema = z.object({
  tyreId: z.string().uuid(),
  targetPartId: z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.string().uuid().optional(),
  ),
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
});

export const recordOilChangeSchema = z.object({
  jobCardId: z.string().uuid(),
  partId: z.string().uuid(),
  litres: litresSchema,
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
});

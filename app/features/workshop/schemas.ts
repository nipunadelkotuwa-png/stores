import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { TYRE_POSITIONS } from "./constants";
import { normalizeTyreSerial } from "./tyre-lifecycle";

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

export const rejectJobCardSchema = z.object({
  jobCardId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export const TYRE_REGISTER_REASONS = [
  "OPENING_BALANCE",
  "LEGACY_RECONCILIATION",
  "INVENTORY_CORRECTION",
] as const;

export type TyreRegisterReason = (typeof TYRE_REGISTER_REASONS)[number];

export const registerTyreSchema = z.object({
  storeId: z.string().uuid(),
  partId: z.string().uuid(),
  serialNumber: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .transform((value) => value.toLowerCase()),
  reason: z.enum(TYRE_REGISTER_REASONS),
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
  supplierId: z.string().uuid(),
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
});

export const receiveTyreFromDagSchema = z.object({
  tyreId: z.string().uuid(),
  targetPartId: z.string().uuid(),
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(16).max(100),
});

const tyreIdListSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map(String).filter((item) => item.length > 0);
  }
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}, z.array(z.string().uuid()).min(1, "Select at least one tyre"));

export const sendTyresToDagSchema = z.object({
  tyreIds: tyreIdListSchema,
  supplierId: z.string().uuid(),
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  batchKey: z.string().uuid(),
});

export const receiveTyresFromDagSchema = z.object({
  tyreIds: tyreIdListSchema,
  businessDate: z.string().date(),
  notes: z.string().trim().max(1000).optional(),
  batchKey: z.string().uuid(),
});

export const rejectTyreAtDagSchema = z.object({
  tyreId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  notes: z.string().trim().max(1000).optional(),
});

export const disposeTyreSchema = z.object({
  tyreId: z.string().uuid(),
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

const serialListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => {
    const lines = Array.isArray(value) ? value : value.split(/\r?\n|,/);
    return lines.map(normalizeTyreSerial).filter((serial) => serial.length > 0);
  });

export const importOrgTyresSchema = z
  .object({
    storeId: z.string().uuid(),
    supplierId: z.string().uuid(),
    businessDate: z.string().date(),
    invoiceReference: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || undefined),
    partId: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
    unitCost: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Unit cost must be a non-negative decimal"),
    serials: serialListSchema,
    idempotencyKey: z.string().min(16).max(100),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    const unique = [
      ...new Set(value.serials.map((serial) => serial.toLowerCase())),
    ];
    if (unique.length !== value.serials.length) {
      ctx.addIssue({
        code: "custom",
        path: ["serials"],
        message: "Serial numbers must be unique",
      });
    }
    if (value.serials.length !== value.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["serials"],
        message: "Number of serials must match the received quantity",
      });
    }
    for (const serial of value.serials) {
      if (serial.length < 2 || serial.length > 80) {
        ctx.addIssue({
          code: "custom",
          path: ["serials"],
          message: "Each serial must be between 2 and 80 characters",
        });
        break;
      }
    }
  });

export type CanonicalTyreImport = {
  storeId: string;
  supplierId: string;
  businessDate: string;
  invoiceReference: string;
  partId: string;
  quantity: number;
  unitCost: string;
  serials: string[];
};

export function canonicalizeTyreImport(command: {
  storeId: string;
  supplierId: string;
  businessDate: string;
  invoiceReference?: string;
  partId: string;
  quantity: number;
  unitCost: string;
  serials: string[];
}): CanonicalTyreImport {
  return {
    storeId: command.storeId,
    supplierId: command.supplierId,
    businessDate: command.businessDate,
    invoiceReference: command.invoiceReference?.trim() ?? "",
    partId: command.partId,
    quantity: command.quantity,
    unitCost: new Decimal(command.unitCost).toFixed(2),
    serials: [...new Set(command.serials.map(normalizeTyreSerial))].sort(
      (a, b) => a.localeCompare(b),
    ),
  };
}

export function tyreImportRequestHash(canonical: CanonicalTyreImport) {
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

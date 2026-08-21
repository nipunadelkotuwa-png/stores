import { z } from "zod";

export const skhPartSchema = z.object({
  sku: z.string().regex(/^SKH-\d{4}$/),
  name: z.string().min(1),
  unit: z.enum(["EA", "SET"]),
  brand: z.string().min(1).nullable(),
  category: z.string().min(1),
  excelItemNumber: z.number().int().nullable(),
  compatibleModels: z.string().min(1).nullable(),
  onHand: z.number().nonnegative(),
  description: z.string().min(1).nullable(),
});

export const skhPartsSchema = z.array(skhPartSchema).min(1);

export type SkhPart = z.infer<typeof skhPartSchema>;

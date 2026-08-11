import { ZodError } from "zod";

export class InsufficientStockError extends Error {
  constructor(public partId: string) {
    super("Insufficient stock for one or more parts");
  }
}

/** Map domain/DB failures to short form messages (never raw SQL). */
export function inventoryActionError(error: unknown, fallback: string): string {
  if (error instanceof InsufficientStockError) {
    return "Insufficient stock. No quantities were changed.";
  }
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback;
  }
  if (error instanceof Error) {
    if (
      error.message.startsWith("Failed query:") ||
      /duplicate key|unique constraint/i.test(error.message)
    ) {
      return fallback;
    }
    return error.message;
  }
  return fallback;
}

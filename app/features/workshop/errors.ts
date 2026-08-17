import { ZodError } from "zod";

export class WorkshopError extends Error {}

export function workshopActionError(error: unknown, fallback: string): string {
  if (error instanceof WorkshopError) return error.message;
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

import { ZodError } from "zod";
import { data } from "react-router";

import { isSerializationFailure } from "~/lib/postgres-error";

export class WorkshopError extends Error {}

export class WorkshopConflictError extends WorkshopError {
  readonly status = 409;
}

export const LIFECYCLE_CONFLICT =
  "This tyre's lifecycle changed. Refresh and try again.";

export function workshopActionError(error: unknown, fallback: string): string {
  if (error instanceof WorkshopError) return error.message;
  if (isSerializationFailure(error)) return LIFECYCLE_CONFLICT;
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

export function workshopActionResult(
  error: unknown,
  fallback: string,
): { error: string } {
  if (error instanceof Response) throw error;
  const message = workshopActionError(error, fallback);
  if (
    error instanceof WorkshopConflictError ||
    isSerializationFailure(error)
  ) {
    return data({ error: message }, { status: 409 }) as unknown as {
      error: string;
    };
  }
  return { error: message };
}

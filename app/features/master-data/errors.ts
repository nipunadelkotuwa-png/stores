/** Shared helpers for master-data create/update actions. */

import { isUniqueViolation as isPostgresUniqueViolation } from "~/lib/postgres-error";

import { BusLifecycleError } from "./bus-lifecycle";

export function isUniqueViolation(error: unknown): boolean {
  return isPostgresUniqueViolation(error);
}

export function masterDataActionError(
  error: unknown,
  duplicateMessage: string,
  fallback: string,
): string {
  if (error instanceof BusLifecycleError) return error.message;
  if (isPostgresUniqueViolation(error, "parts_barcode_unique")) {
    return "A part with that barcode already exists.";
  }
  if (isPostgresUniqueViolation(error, "parts_sku_unique")) {
    return "A part with that SKU already exists.";
  }
  if (isUniqueViolation(error)) return duplicateMessage;
  if (error instanceof Error && error.message.startsWith("Failed query:")) {
    return fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

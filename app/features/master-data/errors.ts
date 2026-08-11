/** Shared helpers for master-data create/update actions. */

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code =
    "code" in error
      ? String((error as { code?: unknown }).code)
      : "cause" in error &&
          error.cause &&
          typeof error.cause === "object" &&
          "code" in error.cause
        ? String((error.cause as { code?: unknown }).code)
        : undefined;
  return code === "23505";
}

export function masterDataActionError(
  error: unknown,
  duplicateMessage: string,
  fallback: string,
): string {
  if (isUniqueViolation(error)) return duplicateMessage;
  if (error instanceof Error && error.message.startsWith("Failed query:")) {
    return fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

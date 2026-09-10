function walkCauses(error: unknown): unknown[] {
  const seen: unknown[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i += 1) {
    seen.push(current);
    current =
      typeof current === "object" && current && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }
  return seen;
}

export function postgresErrorCode(error: unknown): string | undefined {
  for (const node of walkCauses(error)) {
    if (typeof node === "object" && node && "code" in node) {
      const code = (node as { code?: unknown }).code;
      if (typeof code === "string" && code.length > 0) return code;
    }
  }
  return undefined;
}

export function isSerializationFailure(error: unknown): boolean {
  if (postgresErrorCode(error) === "40001") return true;
  if (!(error instanceof Error)) return false;
  return /could not serialize access/i.test(error.message);
}

export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (postgresErrorCode(error) !== "23505") return false;
  if (!constraint) return true;
  const haystack = walkCauses(error)
    .map((node) => {
      if (!node || typeof node !== "object") return "";
      const named =
        "constraint" in node
          ? String((node as { constraint?: string }).constraint ?? "")
          : "";
      const message = node instanceof Error ? node.message : "";
      return `${named} ${message}`;
    })
    .join(" ");
  return haystack.includes(constraint);
}

const GENERIC_FIRST_NAMES = /^(system|admin|user|operator)$/i;

/** First name for greetings; keep full name for titles like "System Administrator". */
export function greetingName(displayName: string): string {
  const trimmed = displayName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return trimmed || displayName;
  if (GENERIC_FIRST_NAMES.test(parts[0] ?? "")) return trimmed;
  return parts[0] ?? trimmed;
}

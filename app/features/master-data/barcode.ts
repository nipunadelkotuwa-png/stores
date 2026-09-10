export function normalizeBarcode(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

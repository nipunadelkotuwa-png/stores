export function matchesScan(
  part: { sku: string; barcode: string | null },
  raw: string,
) {
  const value = raw.trim().toLowerCase();
  if (!value) return false;
  return (
    part.sku.toLowerCase() === value ||
    (part.barcode != null && part.barcode.toLowerCase() === value)
  );
}

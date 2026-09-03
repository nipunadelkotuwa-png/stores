import Decimal from "decimal.js";

export function validateReturnableQuantities(
  returnable: Map<string, { available: Decimal }>,
  lines: { partId: string; quantity: Decimal }[],
) {
  const requested = new Map<string, Decimal>();
  for (const line of lines) {
    requested.set(
      line.partId,
      (requested.get(line.partId) ?? new Decimal(0)).plus(line.quantity),
    );
  }
  for (const [partId, quantity] of requested) {
    const entry = returnable.get(partId);
    if (!entry) {
      return "Cannot return this part. It was not issued on this job card.";
    }
    if (quantity.greaterThan(entry.available)) {
      return `Cannot return ${quantity.toFixed(3)} units. Only ${entry.available.toFixed(3)} units were issued and remain returnable on this job card.`;
    }
  }
  return null;
}

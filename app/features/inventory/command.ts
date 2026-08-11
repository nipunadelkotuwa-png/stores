import Decimal from "decimal.js";

import { postStockSchema } from "./schemas";

export type StockType = "STOCK_RECEIPT" | "BUS_ISSUE" | "ADJUSTMENT";

export function prepareStockCommand(type: StockType, input: unknown) {
  const command = postStockSchema.parse(input);
  if (type === "BUS_ISSUE" && !command.busId) {
    throw new Error("Bus is required for a bus issue");
  }
  if (type === "ADJUSTMENT") {
    const reason = command.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new Error("A reason of at least 3 characters is required");
    }
  }
  const combined = new Map<
    string,
    { partId: string; quantity: Decimal; unitCost?: string }
  >();
  for (const line of command.lines) {
    const current = combined.get(line.partId);
    combined.set(line.partId, {
      partId: line.partId,
      quantity: (current?.quantity ?? new Decimal(0)).plus(line.quantity),
      unitCost: line.unitCost,
    });
  }
  return {
    ...command,
    direction: command.direction ?? "increase",
    lines: [...combined.values()].sort((a, b) =>
      a.partId.localeCompare(b.partId),
    ),
  };
}

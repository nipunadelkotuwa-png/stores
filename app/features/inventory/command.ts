import Decimal from "decimal.js";

import { postStockSchema } from "./schemas";

export type StockType =
  | "STOCK_RECEIPT"
  | "BUS_ISSUE"
  | "BUS_RETURN"
  | "ADJUSTMENT"
  | "TYRE_DAG_SEND"
  | "TYRE_DAG_RECEIVE"
  | "TYRE_DISPOSAL"
  | "TRANSFER_OUT"
  | "TRANSFER_IN";

export function isStockDecrease(
  type: StockType,
  direction: "increase" | "decrease",
) {
  return (
    type === "BUS_ISSUE" ||
    type === "TYRE_DAG_SEND" ||
    type === "TYRE_DISPOSAL" ||
    type === "TRANSFER_OUT" ||
    (type === "ADJUSTMENT" && direction === "decrease")
  );
}

export function prepareStockCommand(type: StockType, input: unknown) {
  const command = postStockSchema.parse(input);
  if ((type === "BUS_ISSUE" || type === "BUS_RETURN") && !command.busId) {
    throw new Error(
      `Bus is required for a ${type.toLowerCase().replace("_", " ")}`,
    );
  }
  if ((type === "BUS_ISSUE" || type === "BUS_RETURN") && !command.jobCardId) {
    throw new Error("An open job card is required to issue or return parts");
  }
  if (type === "ADJUSTMENT") {
    const reason = command.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new Error("A reason of at least 3 characters is required");
    }
  }
  if (type === "TYRE_DAG_SEND" && !command.supplierId) {
    throw new Error("A DAG supplier is required");
  }
  if (type === "TRANSFER_OUT") {
    if (!command.destinationStoreId) {
      throw new Error("Destination store is required for a transfer");
    }
    if (command.destinationStoreId === command.storeId) {
      throw new Error("Destination store must be different from the source");
    }
  }
  if (type === "TRANSFER_IN" && !command.linkedDocumentId) {
    throw new Error("Transfer in must link to a transfer-out document");
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

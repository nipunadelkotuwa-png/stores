export function formatAuditDetail(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return "—";
  const record = metadata as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string" && message.length > 0) return message;
  const receiptNumber = record.receiptNumber;
  const purchaseNumber = record.purchaseNumber;
  if (typeof purchaseNumber === "string") {
    return typeof receiptNumber === "string"
      ? `${purchaseNumber} → ${receiptNumber}`
      : purchaseNumber;
  }
  const documentNumber = record.documentNumber;
  const reverses = record.reverses;
  if (typeof documentNumber === "string" && typeof reverses === "string") {
    return `${documentNumber} reverses ${reverses}`;
  }
  if (typeof documentNumber === "string") return documentNumber;
  return "—";
}

export function auditReceiptPath(event: {
  entityType: string;
  entityId: string;
}) {
  if (event.entityType === "stock_document" && event.entityId) {
    return `/receipts/${event.entityId}`;
  }
  return null;
}

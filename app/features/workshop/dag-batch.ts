import { WorkshopError } from "./errors";

export type DagBatchOperation = "DAG_OUT" | "DAG_IN";

export function dagDocumentIdempotencyKey(
  operation: DagBatchOperation,
  batchKey: string,
  tyreId: string,
) {
  return `${operation}:${batchKey}:${tyreId}`;
}

export function dagBatchError(
  operation: "send" | "receive",
  failures: string[],
) {
  const heading =
    operation === "send"
      ? "Cannot send DAG batch."
      : "Cannot receive DAG batch.";
  return new WorkshopError([heading, ...failures].join("\n"));
}

export function parseTyreIdQuery(value: string | null) {
  if (!value) return [] as string[];
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

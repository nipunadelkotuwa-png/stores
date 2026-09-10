import { describe, expect, it } from "vitest";
import {
  dagBatchError,
  dagDocumentIdempotencyKey,
  parseTyreIdQuery,
} from "../../app/features/workshop/dag-batch";
import {
  receiveTyresFromDagSchema,
  sendTyresToDagSchema,
} from "../../app/features/workshop/schemas";

describe("DAG batch helpers", () => {
  it("scopes document keys by operation", () => {
    const batchKey = "11111111-1111-4111-8111-111111111111";
    const tyreId = "22222222-2222-4222-8222-222222222222";
    expect(dagDocumentIdempotencyKey("DAG_OUT", batchKey, tyreId)).toBe(
      `DAG_OUT:${batchKey}:${tyreId}`,
    );
    expect(dagDocumentIdempotencyKey("DAG_IN", batchKey, tyreId)).toBe(
      `DAG_IN:${batchKey}:${tyreId}`,
    );
    expect(dagDocumentIdempotencyKey("DAG_OUT", batchKey, tyreId)).not.toBe(
      dagDocumentIdempotencyKey("DAG_IN", batchKey, tyreId),
    );
  });

  it("parses one or many deep-link ids", () => {
    expect(parseTyreIdQuery(null)).toEqual([]);
    expect(parseTyreIdQuery("aaa")).toEqual(["aaa"]);
    expect(parseTyreIdQuery("aaa,bbb, aaa")).toEqual(["aaa", "bbb"]);
  });

  it("lists every invalid serial in one error", () => {
    const error = dagBatchError("receive", [
      "TY-00428 — no DAG1 return SKU",
      "TY-00612 — already received",
    ]);
    expect(error.message).toContain("Cannot receive DAG batch.");
    expect(error.message).toContain("TY-00428");
    expect(error.message).toContain("TY-00612");
  });
});

describe("DAG batch schemas", () => {
  const batchKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tyreA = "55555555-5555-4555-8555-555555555555";
  const tyreB = "66666666-6666-4666-8666-666666666666";

  it("accepts multiple tyre ids and a uuid batch key", () => {
    expect(
      sendTyresToDagSchema.safeParse({
        tyreIds: [tyreA, tyreB],
        supplierId: "77777777-7777-4777-8777-777777777777",
        businessDate: "2026-08-17",
        batchKey,
      }).success,
    ).toBe(true);
    expect(
      receiveTyresFromDagSchema.safeParse({
        tyreIds: tyreA,
        businessDate: "2026-08-17",
        batchKey,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty selection", () => {
    expect(
      sendTyresToDagSchema.safeParse({
        tyreIds: [],
        supplierId: "77777777-7777-4777-8777-777777777777",
        businessDate: "2026-08-17",
        batchKey,
      }).success,
    ).toBe(false);
  });
});

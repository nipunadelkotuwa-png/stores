import { describe, expect, it } from "vitest";
import {
  closeJobCardSchema,
  fitTyreSchema,
  openJobCardSchema,
  recordOilChangeSchema,
  registerTyreSchema,
} from "../../app/features/workshop/schemas";
import {
  canSendToDag,
  nextDagStage,
  receiveIsScrap,
} from "../../app/features/workshop/tyre-lifecycle";

describe("nextDagStage", () => {
  it("advances ORG through DAG stages then scrap", () => {
    expect(nextDagStage("ORG")).toBe("DAG1");
    expect(nextDagStage("DAG1")).toBe("DAG2");
    expect(nextDagStage("DAG2")).toBe("DAG3");
    expect(nextDagStage("DAG3")).toBe("SCRAP");
    expect(nextDagStage("SCRAP")).toBe("SCRAP");
  });

  it("treats DAG3 receive as scrap and blocks sending scrap", () => {
    expect(receiveIsScrap("DAG3")).toBe(true);
    expect(receiveIsScrap("DAG2")).toBe(false);
    expect(canSendToDag("ORG")).toBe(true);
    expect(canSendToDag("SCRAP")).toBe(false);
  });
});

describe("workshop schemas", () => {
  it("requires a complaint when opening a job card", () => {
    const result = openJobCardSchema.safeParse({
      storeId: "11111111-1111-4111-8111-111111111111",
      busId: "33333333-3333-4333-8333-333333333333",
      businessDate: "2026-08-17",
      complaint: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid job card and oil change", () => {
    expect(
      openJobCardSchema.safeParse({
        storeId: "11111111-1111-4111-8111-111111111111",
        busId: "33333333-3333-4333-8333-333333333333",
        businessDate: "2026-08-17",
        odometerKm: "120000",
        complaint: "Engine noise",
      }).success,
    ).toBe(true);
    expect(
      closeJobCardSchema.safeParse({
        jobCardId: "44444444-4444-4444-8444-444444444444",
        workDone: "Replaced belt",
      }).success,
    ).toBe(true);
    expect(
      recordOilChangeSchema.safeParse({
        jobCardId: "44444444-4444-4444-8444-444444444444",
        partId: "22222222-2222-4222-8222-222222222222",
        litres: "18.5",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid tyre fit positions and litres", () => {
    expect(
      fitTyreSchema.safeParse({
        jobCardId: "44444444-4444-4444-8444-444444444444",
        tyreId: "55555555-5555-4555-8555-555555555555",
        position: "FRONT",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(false);
    expect(
      recordOilChangeSchema.safeParse({
        jobCardId: "44444444-4444-4444-8444-444444444444",
        partId: "22222222-2222-4222-8222-222222222222",
        litres: "0",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(false);
    expect(
      registerTyreSchema.safeParse({
        storeId: "11111111-1111-4111-8111-111111111111",
        partId: "22222222-2222-4222-8222-222222222222",
        serialNumber: "SN-1",
      }).success,
    ).toBe(true);
  });
});

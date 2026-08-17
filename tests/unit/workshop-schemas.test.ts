import { describe, expect, it } from "vitest";
import {
  closeJobCardSchema,
  disposeTyreSchema,
  fitTyreSchema,
  openJobCardSchema,
  receiveTyreFromDagSchema,
  recordOilChangeSchema,
  registerTyreSchema,
  sendTyreToDagSchema,
} from "../../app/features/workshop/schemas";
import {
  UNUSUAL_ISSUE_THRESHOLD,
  UNUSUAL_ISSUE_WINDOW_DAYS,
} from "../../app/features/workshop/constants";
import {
  canSendToDag,
  isOperableInStore,
  nextDagStage,
  skuMatchesLifecycleStage,
} from "../../app/features/workshop/tyre-lifecycle";

describe("nextDagStage", () => {
  it("advances ORG through DAG and rebuild then scrap", () => {
    expect(nextDagStage("ORG")).toBe("DAG1");
    expect(nextDagStage("DAG1")).toBe("DAG2");
    expect(nextDagStage("DAG2")).toBe("DAG3");
    expect(nextDagStage("DAG3")).toBe("REBUILD");
    expect(nextDagStage("REBUILD")).toBe("SCRAP");
    expect(nextDagStage("SCRAP")).toBe("SCRAP");
  });

  it("allows sending rebuild casings but not scrap", () => {
    expect(canSendToDag("ORG")).toBe(true);
    expect(canSendToDag("REBUILD")).toBe(true);
    expect(canSendToDag("SCRAP")).toBe(false);
  });

  it("blocks fit, DAG send, and dispose unless the serial is in store", () => {
    expect(isOperableInStore("IN_STORE")).toBe(true);
    expect(isOperableInStore("IN_TRANSIT")).toBe(false);
    expect(isOperableInStore("AT_DAG")).toBe(false);
    expect(isOperableInStore("DISPOSED")).toBe(false);
  });

  it("matches tyre SKUs to the chosen DAG return stage", () => {
    expect(skuMatchesLifecycleStage("TR-ORG-295", "ORG")).toBe(true);
    expect(skuMatchesLifecycleStage("TR-DAG1-295", "DAG1")).toBe(true);
    expect(skuMatchesLifecycleStage("TR-REBUILD-295", "REBUILD")).toBe(true);
    expect(skuMatchesLifecycleStage("TR-DAG1-295", "DAG")).toBe(false);
    expect(skuMatchesLifecycleStage("TR-ORG-295", "DAG1")).toBe(false);
  });
});

describe("unusual issue threshold", () => {
  it("flags three or more issues in a 30-day window, including pending", () => {
    expect(UNUSUAL_ISSUE_THRESHOLD).toBe(3);
    expect(UNUSUAL_ISSUE_WINDOW_DAYS).toBe(30);
    expect(2 >= UNUSUAL_ISSUE_THRESHOLD).toBe(false);
    expect(3 >= UNUSUAL_ISSUE_THRESHOLD).toBe(true);
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
    expect(
      registerTyreSchema.safeParse({
        storeId: "11111111-1111-4111-8111-111111111111",
        partId: "22222222-2222-4222-8222-222222222222",
        serialNumber: "SN-1",
        lifecycleStage: "SCRAP",
      }).success,
    ).toBe(false);
  });

  it("requires supplier and chosen return stage for DAG", () => {
    expect(
      sendTyreToDagSchema.safeParse({
        tyreId: "55555555-5555-4555-8555-555555555555",
        businessDate: "2026-08-17",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(false);
    expect(
      sendTyreToDagSchema.safeParse({
        tyreId: "55555555-5555-4555-8555-555555555555",
        supplierId: "66666666-6666-4666-8666-666666666666",
        businessDate: "2026-08-17",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(true);
    expect(
      receiveTyreFromDagSchema.safeParse({
        tyreId: "55555555-5555-4555-8555-555555555555",
        toStage: "REBUILD",
        targetPartId: "22222222-2222-4222-8222-222222222222",
        businessDate: "2026-08-17",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(true);
    expect(
      disposeTyreSchema.safeParse({
        tyreId: "55555555-5555-4555-8555-555555555555",
        businessDate: "2026-08-17",
        idempotencyKey: "0123456789abcdef",
      }).success,
    ).toBe(true);
  });
});

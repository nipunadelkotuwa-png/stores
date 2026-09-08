import { describe, expect, it } from "vitest";
import {
  canSendToDag,
  dagAttemptLabel,
  expectedReturnStage,
  fitActionLabel,
  getTyreLifecycleActions,
  lifecycleStageFromSku,
  nextDagStage,
} from "../../app/features/workshop/tyre-lifecycle";
import { WorkshopError } from "../../app/features/workshop/errors";

const tyreId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function event(
  type: string,
  sequence: number,
  id = tyreId,
): { tyreId: string; type: string; sequence: number } {
  return { tyreId: id, type, sequence };
}

function actions(
  status: string,
  stage: string,
  events: { tyreId: string; type: string; sequence: number }[],
) {
  return getTyreLifecycleActions({ tyreId, status, stage, events });
}

describe("tyre DAG lifecycle", () => {
  it("allows only ORG/DAG1/DAG2 to send", () => {
    expect(canSendToDag("ORG")).toBe(true);
    expect(canSendToDag("DAG1")).toBe(true);
    expect(canSendToDag("DAG2")).toBe(true);
    expect(canSendToDag("DAG3")).toBe(false);
    expect(canSendToDag("REBUILD")).toBe(false);
    expect(canSendToDag("SCRAP")).toBe(false);
  });

  it("advances stages sequentially", () => {
    expect(nextDagStage("ORG")).toBe("DAG1");
    expect(nextDagStage("DAG1")).toBe("DAG2");
    expect(nextDagStage("DAG2")).toBe("DAG3");
    expect(() => nextDagStage("DAG3")).toThrow(WorkshopError);
  });

  it("labels DAG attempts", () => {
    expect(dagAttemptLabel("ORG")).toBe("1st DAG");
    expect(dagAttemptLabel("DAG1")).toBe("2nd DAG");
    expect(dagAttemptLabel("DAG2")).toBe("3rd DAG");
    expect(expectedReturnStage("ORG")).toBe("DAG1");
    expect(expectedReturnStage("DAG3")).toBeNull();
  });

  it("derives stage from SKU tokens", () => {
    expect(lifecycleStageFromSku("TR-ORG-295")).toBe("ORG");
    expect(lifecycleStageFromSku("TR-DAG1-295")).toBe("DAG1");
    expect(lifecycleStageFromSku("TR-DAG3-295")).toBe("DAG3");
    expect(lifecycleStageFromSku("FILTER-01")).toBeNull();
  });
});

describe("getTyreLifecycleActions", () => {
  it("treats a fresh ORG register as fit-only", () => {
    expect(actions("IN_STORE", "ORG", [event("REGISTER", 1)])).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: false,
    });
  });

  it("requires FIT then REMOVE of the same tyre after stage entry", () => {
    expect(
      actions("IN_STORE", "ORG", [event("REGISTER", 1), event("REMOVE", 2)]),
    ).toMatchObject({ canSendToDag: false, canDispose: false });

    expect(
      actions("IN_STORE", "ORG", [
        event("REGISTER", 1),
        event("FIT", 2),
        event("REMOVE", 3),
      ]),
    ).toEqual({
      canFit: true,
      canSendToDag: true,
      canDispose: true,
    });
  });

  it("counts incoming REPLACE as FIT", () => {
    expect(
      actions("IN_STORE", "ORG", [
        event("REGISTER", 1),
        event("REPLACE", 2),
        event("REMOVE", 3),
      ]),
    ).toMatchObject({ canSendToDag: true, canDispose: true });
  });

  it("ignores REMOVE belonging to another tyre", () => {
    const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(
      actions("IN_STORE", "ORG", [
        event("REGISTER", 1),
        event("FIT", 2),
        event("REMOVE", 3, other),
      ]),
    ).toMatchObject({ canSendToDag: false, canDispose: false });
  });

  it("orders by sequence, not list order", () => {
    expect(
      actions("IN_STORE", "ORG", [
        event("REMOVE", 3),
        event("FIT", 2),
        event("REGISTER", 1),
      ]),
    ).toMatchObject({ canSendToDag: true });
  });

  it("resets eligibility after RECEIVE_DAG", () => {
    const afterReceive = actions("IN_STORE", "DAG1", [
      event("REGISTER", 1),
      event("FIT", 2),
      event("REMOVE", 3),
      event("SEND_DAG", 4),
      event("RECEIVE_DAG", 5),
    ]);
    expect(afterReceive).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: false,
    });

    expect(
      actions("IN_STORE", "DAG1", [
        event("REGISTER", 1),
        event("FIT", 2),
        event("REMOVE", 3),
        event("SEND_DAG", 4),
        event("RECEIVE_DAG", 5),
        event("FIT", 6),
        event("REMOVE", 7),
      ]),
    ).toMatchObject({ canSendToDag: true, canDispose: true });
  });

  it("blocks DAG and dispose on a fresh DAG3 receive", () => {
    expect(
      actions("IN_STORE", "DAG3", [
        event("REGISTER", 1),
        event("RECEIVE_DAG", 10),
      ]),
    ).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: false,
    });
  });

  it("allows dispose but not DAG after DAG3 service", () => {
    expect(
      actions("IN_STORE", "DAG3", [
        event("RECEIVE_DAG", 10),
        event("FIT", 11),
        event("REMOVE", 12),
      ]),
    ).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: true,
    });
  });

  it("blocks all warehouse actions when reserved for a pending fit", () => {
    expect(
      getTyreLifecycleActions({
        tyreId,
        status: "IN_STORE",
        stage: "ORG",
        reserved: true,
        events: [event("REGISTER", 1), event("FIT", 2), event("REMOVE", 3)],
      }),
    ).toEqual({
      canFit: false,
      canSendToDag: false,
      canDispose: false,
    });
  });

  it("does not offer dispose for rebuild/scrap stages", () => {
    expect(
      actions("IN_STORE", "REBUILD", [
        event("REGISTER", 1),
        event("FIT", 2),
        event("REMOVE", 3),
      ]),
    ).toEqual({
      canFit: true,
      canSendToDag: false,
      canDispose: false,
    });
  });

  it("blocks all warehouse actions when fitted, at DAG, or disposed", () => {
    const serviced = [
      event("REGISTER", 1),
      event("FIT", 2),
      event("REMOVE", 3),
    ];
    expect(actions("FITTED", "ORG", serviced)).toEqual({
      canFit: false,
      canSendToDag: false,
      canDispose: false,
    });
    expect(actions("AT_DAG", "ORG", serviced)).toEqual({
      canFit: false,
      canSendToDag: false,
      canDispose: false,
    });
    expect(actions("DISPOSED", "ORG", serviced)).toEqual({
      canFit: false,
      canSendToDag: false,
      canDispose: false,
    });
  });

  it("labels Fit vs Fit again from eligibility", () => {
    expect(
      fitActionLabel(actions("IN_STORE", "ORG", [event("REGISTER", 1)])),
    ).toBe("Fit");
    expect(
      fitActionLabel(
        actions("IN_STORE", "ORG", [
          event("REGISTER", 1),
          event("FIT", 2),
          event("REMOVE", 3),
        ]),
      ),
    ).toBe("Fit again");
  });
});

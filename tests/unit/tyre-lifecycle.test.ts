import { describe, expect, it } from "vitest";
import {
  canSendToDag,
  dagAttemptLabel,
  expectedReturnStage,
  nextDagStage,
} from "../../app/features/workshop/tyre-lifecycle";
import { WorkshopError } from "../../app/features/workshop/errors";

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
});

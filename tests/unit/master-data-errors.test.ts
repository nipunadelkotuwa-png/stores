import { describe, expect, it } from "vitest";
import { BusLifecycleError } from "../../app/features/master-data/bus-lifecycle";
import { masterDataActionError } from "../../app/features/master-data/errors";

describe("masterDataActionError", () => {
  it("maps unique violations", () => {
    expect(
      masterDataActionError(
        Object.assign(new Error("duplicate"), { code: "23505" }),
        "Already exists.",
        "Fallback",
      ),
    ).toBe("Already exists.");
  });

  it("hides Failed query messages", () => {
    expect(
      masterDataActionError(
        new Error("Failed query: insert into parts"),
        "Already exists.",
        "Unable to add part.",
      ),
    ).toBe("Unable to add part.");
  });

  it("surfaces bus lifecycle errors", () => {
    expect(
      masterDataActionError(
        new BusLifecycleError("This bus has 1 unresolved job card."),
        "Already exists.",
        "Fallback",
      ),
    ).toBe("This bus has 1 unresolved job card.");
  });
});

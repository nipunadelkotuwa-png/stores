import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_CONFLICT,
  WorkshopConflictError,
  workshopActionError,
} from "../../app/features/workshop/errors";
import { isSerializationFailure } from "../../app/lib/postgres-error";

describe("workshopActionError", () => {
  it("maps serialization failures to the lifecycle refresh message", () => {
    const error = Object.assign(
      new Error(
        "Failed query: could not serialize access due to concurrent update",
      ),
      {
        code: "40001",
      },
    );
    expect(isSerializationFailure(error)).toBe(true);
    expect(workshopActionError(error, "Unable to update DAG tyre")).toBe(
      LIFECYCLE_CONFLICT,
    );
  });

  it("preserves conflict messages", () => {
    expect(
      workshopActionError(
        new WorkshopConflictError(LIFECYCLE_CONFLICT),
        "Unable to dispose tyre",
      ),
    ).toBe(LIFECYCLE_CONFLICT);
  });
});

import { describe, expect, it } from "vitest";
import {
  encodeWorkshopNotes,
  parseWorkshopNotes,
} from "~/features/workshop/pending-notes";

describe("workshop pending notes", () => {
  it("round-trips a tyre fit payload", () => {
    const notes = encodeWorkshopNotes(
      { kind: "TYRE_FIT", tyreId: "t1", position: "FL", occupantId: "t0" },
      "Fit front left",
    );
    expect(parseWorkshopNotes(notes)).toEqual({
      kind: "TYRE_FIT",
      tyreId: "t1",
      position: "FL",
      occupantId: "t0",
    });
    expect(notes).toContain("Fit front left");
  });

  it("returns null for ordinary notes", () => {
    expect(parseWorkshopNotes("Oil change")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { greetingName } from "~/lib/display-name";

describe("greetingName", () => {
  it("uses the first name for ordinary display names", () => {
    expect(greetingName("Harsha Perera")).toBe("Harsha");
  });

  it("keeps titles like System Administrator intact", () => {
    expect(greetingName("System Administrator")).toBe("System Administrator");
  });

  it("returns a single token unchanged", () => {
    expect(greetingName("Clerk")).toBe("Clerk");
  });
});

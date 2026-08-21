import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { skhPartsSchema } from "../../database/seeds/sk-h-schema";

describe("SK-H catalogue", () => {
  const parts = skhPartsSchema.parse(
    JSON.parse(readFileSync("database/seeds/sk-h-parts.json", "utf8")),
  );

  it("has unique SKUs and unique display names", () => {
    const skus = parts.map((part) => part.sku);
    const names = parts.map((part) => part.name.toLowerCase());
    expect(new Set(skus).size).toBe(parts.length);
    expect(new Set(names).size).toBe(parts.length);
    expect(parts).toHaveLength(297);
  });

  it("keeps Leyland rows distinct from China item numbers in descriptions", () => {
    const leyland = parts.filter((part) =>
      part.description?.startsWith("Leyland list item"),
    );
    expect(leyland).toHaveLength(5);
    expect(leyland.map((part) => part.sku)).toEqual([
      "SKH-0293",
      "SKH-0294",
      "SKH-0295",
      "SKH-0296",
      "SKH-0297",
    ]);
  });

  it("preserves box pack notes in the description", () => {
    expect(parts.some((part) => part.description?.includes("4 Box"))).toBe(
      true,
    );
  });
});

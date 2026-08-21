import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  DUPLICATE_PART_MESSAGE,
  formatZodLineError,
  loadStockLines,
  MAX_STOCK_LINES,
  parseStockLinesFromForm,
} from "../../app/features/inventory/form-lines";

describe("parseStockLinesFromForm", () => {
  it("reads two part/quantity rows", () => {
    const form = new FormData();
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("quantity", "1.5");
    form.append("partId", "22222222-2222-4222-8222-222222222222");
    form.append("quantity", "3");

    expect(parseStockLinesFromForm(form)).toEqual([
      {
        partId: "11111111-1111-4111-8111-111111111111",
        quantity: "1.5",
        sourceIndex: 0,
      },
      {
        partId: "22222222-2222-4222-8222-222222222222",
        quantity: "3",
        sourceIndex: 1,
      },
    ]);
  });

  it("omits empty unit costs and keeps filled ones", () => {
    const form = new FormData();
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("quantity", "1");
    form.append("unitCost", "");
    form.append("partId", "22222222-2222-4222-8222-222222222222");
    form.append("quantity", "2");
    form.append("unitCost", "10.50");

    expect(parseStockLinesFromForm(form, "unitCost")).toEqual([
      {
        partId: "11111111-1111-4111-8111-111111111111",
        quantity: "1",
        sourceIndex: 0,
      },
      {
        partId: "22222222-2222-4222-8222-222222222222",
        quantity: "2",
        unitCost: "10.50",
        sourceIndex: 1,
      },
    ]);
  });

  it("keeps incomplete rows when a part is present without quantity", () => {
    const form = new FormData();
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("partId", "22222222-2222-4222-8222-222222222222");
    form.append("quantity", "4");

    expect(parseStockLinesFromForm(form)).toEqual([
      {
        partId: "11111111-1111-4111-8111-111111111111",
        quantity: "4",
        sourceIndex: 0,
      },
      {
        partId: "22222222-2222-4222-8222-222222222222",
        quantity: "",
        sourceIndex: 1,
      },
    ]);
  });

  it("skips blank extra rows", () => {
    const form = new FormData();
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("quantity", "1");
    form.append("partId", "");
    form.append("quantity", "");

    expect(parseStockLinesFromForm(form)).toEqual([
      {
        partId: "11111111-1111-4111-8111-111111111111",
        quantity: "1",
        sourceIndex: 0,
      },
    ]);
  });
});

describe("loadStockLines", () => {
  it("rejects an empty form", () => {
    expect(loadStockLines(new FormData())).toEqual({
      ok: false,
      error: "Add at least one part with a quantity.",
    });
  });

  it("rejects a quantity without a part", () => {
    const form = new FormData();
    form.append("partId", "");
    form.append("quantity", "2");

    expect(loadStockLines(form)).toEqual({
      ok: false,
      error: "Item 1: Select a part.",
      lineErrors: { 0: "Select a part." },
    });
  });

  it("rejects the same part on two lines", () => {
    const form = new FormData();
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("quantity", "1");
    form.append("partId", "11111111-1111-4111-8111-111111111111");
    form.append("quantity", "2");

    expect(loadStockLines(form)).toEqual({
      ok: false,
      error: DUPLICATE_PART_MESSAGE,
      lineErrors: { 1: DUPLICATE_PART_MESSAGE },
    });
  });

  it("rejects more than MAX_STOCK_LINES rows", () => {
    const form = new FormData();
    for (let index = 0; index < MAX_STOCK_LINES + 1; index += 1) {
      const n = String(index).padStart(12, "0");
      form.append("partId", `11111111-1111-4111-8111-${n.slice(-12)}`);
      form.append("quantity", "1");
    }
    expect(loadStockLines(form)).toEqual({
      ok: false,
      error: `A document can have at most ${MAX_STOCK_LINES} lines.`,
    });
  });
});

describe("formatZodLineError", () => {
  it("maps Zod line paths back to the original row", () => {
    const result = formatZodLineError(
      new ZodError([
        {
          code: "custom",
          message: "Quantity must be a positive decimal",
          path: ["lines", 0, "quantity"],
        },
      ]),
      [
        {
          partId: "11111111-1111-4111-8111-111111111111",
          quantity: "0",
          sourceIndex: 2,
        },
      ],
    );
    expect(result.error).toBe("Item 3: Quantity must be a positive decimal");
    expect(result.lineErrors).toEqual({
      2: "Quantity must be a positive decimal",
    });
  });
});

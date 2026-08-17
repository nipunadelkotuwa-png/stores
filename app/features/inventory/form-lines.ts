import { ZodError } from "zod";

export const MAX_STOCK_LINES = 100;

export const DUPLICATE_PART_MESSAGE =
  "Each part can only appear once. Increase the quantity on the existing line instead.";

export type ParsedStockLine = {
  partId: string;
  quantity: string;
  unitCost?: string;
  unitPrice?: string;
  sourceIndex: number;
};

export type StockLinesFailure = {
  ok: false;
  error: string;
  lineErrors?: Record<number, string>;
};

export type StockLinesSuccess = {
  ok: true;
  lines: ParsedStockLine[];
};

export type StockLinesResult = StockLinesSuccess | StockLinesFailure;

function isBlank(value: string | undefined) {
  return !value || value.trim() === "";
}

function isEmptyLine(line: {
  partId: string;
  quantity: string;
  unitCost?: string;
  unitPrice?: string;
}) {
  return (
    isBlank(line.partId) &&
    isBlank(line.quantity) &&
    isBlank(line.unitCost) &&
    isBlank(line.unitPrice)
  );
}

export function parseStockLinesFromForm(
  formData: FormData,
  costName?: "unitCost" | "unitPrice",
): ParsedStockLine[] {
  const partIds = formData.getAll("partId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const costs = costName ? formData.getAll(costName).map(String) : [];
  const rowCount = Math.max(partIds.length, quantities.length, costs.length);

  const rows: ParsedStockLine[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const line: ParsedStockLine = {
      partId: (partIds[index] ?? "").trim(),
      quantity: (quantities[index] ?? "").trim(),
      sourceIndex: index,
    };
    if (costName) {
      const cost = (costs[index] ?? "").trim();
      if (cost) line[costName] = cost;
    }
    if (!isEmptyLine(line)) rows.push(line);
  }
  return rows;
}

export function loadStockLines(
  formData: FormData,
  costName?: "unitCost" | "unitPrice",
): StockLinesResult {
  const lines = parseStockLinesFromForm(formData, costName);
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one part with a quantity." };
  }

  const seen = new Map<string, number>();
  for (const line of lines) {
    if (!line.partId) {
      return {
        ok: false,
        error: `Item ${line.sourceIndex + 1}: Select a part.`,
        lineErrors: { [line.sourceIndex]: "Select a part." },
      };
    }
    if (!line.quantity) {
      return {
        ok: false,
        error: `Item ${line.sourceIndex + 1}: Enter a quantity.`,
        lineErrors: { [line.sourceIndex]: "Enter a quantity." },
      };
    }
    if (seen.has(line.partId)) {
      return {
        ok: false,
        error: DUPLICATE_PART_MESSAGE,
        lineErrors: { [line.sourceIndex]: DUPLICATE_PART_MESSAGE },
      };
    }
    seen.set(line.partId, line.sourceIndex);
  }

  return { ok: true, lines };
}

export function formatZodLineError(
  error: ZodError,
  lines: ParsedStockLine[],
): StockLinesFailure {
  const lineErrors: Record<number, string> = {};
  const messages: string[] = [];
  for (const issue of error.issues) {
    if (issue.path[0] === "lines" && typeof issue.path[1] === "number") {
      const source = lines[issue.path[1]]?.sourceIndex ?? issue.path[1];
      lineErrors[source] = issue.message;
      messages.push(`Item ${source + 1}: ${issue.message}`);
    } else {
      messages.push(issue.message);
    }
  }
  return {
    ok: false,
    error: messages.join(" ") || "Invalid line items.",
    lineErrors,
  };
}

export function stockLinesActionError(
  error: unknown,
  fallback: string,
  lines: ParsedStockLine[],
  mapError: (error: unknown, fallback: string) => string,
): StockLinesFailure {
  if (error instanceof ZodError) return formatZodLineError(error, lines);
  return { ok: false, error: mapError(error, fallback) };
}

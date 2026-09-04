import { TYRE_POSITIONS, type TyrePosition } from "./constants";

export type WorkshopPendingPayload =
  | { kind: "OIL" }
  | {
      kind: "TYRE_FIT";
      tyreId: string;
      position: TyrePosition;
      occupantId?: string;
    };

const PREFIX = "[WORKSHOP]";

export function encodeWorkshopNotes(
  payload: WorkshopPendingPayload,
  notes?: string | null,
) {
  const extra = notes?.trim();
  return `${PREFIX}${JSON.stringify(payload)}${extra ? `\n${extra}` : ""}`;
}

export function parseWorkshopNotes(
  notes: string | null | undefined,
): WorkshopPendingPayload | null {
  if (!notes?.startsWith(PREFIX)) return null;
  const line = notes.slice(PREFIX.length).split("\n")[0];
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as WorkshopPendingPayload;
    if (parsed.kind === "OIL") return parsed;
    if (
      parsed.kind === "TYRE_FIT" &&
      typeof parsed.tyreId === "string" &&
      TYRE_POSITIONS.includes(parsed.position)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export class BusLifecycleError extends Error {}

export type BusLifecycleStatus = "ACTIVE" | "INACTIVE" | "SOLD";

export function busStatusLabel(status: string): string {
  if (status === "SOLD") return "Sold";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

export function busStatusBadgeClass(status: string): string {
  if (status === "ACTIVE") return "badge success";
  if (status === "SOLD") return "badge warning";
  return "badge";
}

export function unresolvedJobCardsMessage(jobNumbers: string[]): string {
  const count = jobNumbers.length;
  const noun = count === 1 ? "job card" : "job cards";
  const list = jobNumbers.join(", ");
  return `This bus has ${count} unresolved ${noun} (${list}). Close or cancel them before marking the bus as sold.`;
}

export function busUnavailableForJobCardMessage(
  status: string | undefined,
  active: boolean,
): string | null {
  if (status === "SOLD") {
    return "This bus has been sold and cannot be used for job cards.";
  }
  if (status !== "ACTIVE" || !active) {
    return "Bus is not available";
  }
  return null;
}

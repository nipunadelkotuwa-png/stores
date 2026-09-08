import {
  BUSINESS_DAG_STAGES,
  DAG_ELIGIBLE_STAGES,
  DAG_STAGE_PROGRESSION,
  type TyreLifecycleStage,
  type UsableTyreStage,
} from "./constants";
import { WorkshopError } from "./errors";

export function nextDagStage(current: TyreLifecycleStage): TyreLifecycleStage {
  const next = DAG_STAGE_PROGRESSION[current];
  if (!next) {
    throw new WorkshopError(
      current === "DAG3"
        ? "DAG3 tyres cannot be sent for another DAG cycle"
        : `Cannot derive next DAG stage from ${current}`,
    );
  }
  return next;
}

export function canSendToDag(stage: TyreLifecycleStage) {
  return (DAG_ELIGIBLE_STAGES as readonly string[]).includes(stage);
}

export function dagAttemptLabel(stage: TyreLifecycleStage): string | null {
  if (stage === "ORG") return "1st DAG";
  if (stage === "DAG1") return "2nd DAG";
  if (stage === "DAG2") return "3rd DAG";
  return null;
}

export function expectedReturnStage(
  stage: TyreLifecycleStage,
): TyreLifecycleStage | null {
  try {
    return nextDagStage(stage);
  } catch {
    return null;
  }
}

export function isBusinessDagStage(stage: string) {
  return (BUSINESS_DAG_STAGES as readonly string[]).includes(stage);
}

export function skuMatchesLifecycleStage(sku: string, stage: string) {
  const token = stage.toUpperCase();
  return new RegExp(`(^|[^A-Z0-9])${token}([^A-Z0-9]|$)`).test(
    sku.toUpperCase(),
  );
}

export function lifecycleStageFromSku(sku: string): UsableTyreStage | null {
  const ordered: UsableTyreStage[] = ["DAG3", "DAG2", "DAG1", "ORG", "REBUILD"];
  for (const stage of ordered) {
    if (skuMatchesLifecycleStage(sku, stage)) return stage;
  }
  return null;
}

export function isOperableInStore(status: string) {
  return status === "IN_STORE";
}

export function statusLabel(status: string) {
  if (status === "IN_STORE") return "Warehouse";
  if (status === "FITTED") return "On bus";
  if (status === "AT_DAG") return "At DAG";
  if (status === "IN_TRANSIT") return "In transit";
  if (status === "DISPOSED") return "Disposed";
  if (status === "SCRAPPED") return "Scrapped";
  return status;
}

export function normalizeTyreSerial(value: string) {
  return value.trim().toLowerCase();
}

export type TyreLifecycleEvent = {
  tyreId: string;
  type: string;
  sequence: number;
};

export type TyreLifecycleActions = {
  canFit: boolean;
  canSendToDag: boolean;
  canDispose: boolean;
};

const NONE: TyreLifecycleActions = {
  canFit: false,
  canSendToDag: false,
  canDispose: false,
};

function eventsForTyre(tyreId: string, events: TyreLifecycleEvent[]) {
  return events
    .filter((event) => event.tyreId === tyreId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
}

export function hasCompletedServiceInCurrentStage(
  tyreId: string,
  status: string,
  events: TyreLifecycleEvent[],
) {
  if (status !== "IN_STORE") return false;
  const ordered = eventsForTyre(tyreId, events);
  const stageEntries = ordered.filter(
    (event) => event.type === "REGISTER" || event.type === "RECEIVE_DAG",
  );
  const stageEntry = stageEntries.at(-1);
  if (!stageEntry) return false;
  const fit = ordered.find(
    (event) =>
      (event.type === "FIT" || event.type === "REPLACE") &&
      event.sequence > stageEntry.sequence,
  );
  if (!fit) return false;
  return ordered.some(
    (event) => event.type === "REMOVE" && event.sequence > fit.sequence,
  );
}

export function getTyreLifecycleActions(input: {
  tyreId: string;
  stage: string;
  status: string;
  events: TyreLifecycleEvent[];
  reserved?: boolean;
}): TyreLifecycleActions {
  if (input.reserved || input.status !== "IN_STORE") return NONE;
  const serviced = hasCompletedServiceInCurrentStage(
    input.tyreId,
    input.status,
    input.events,
  );
  const businessStage = isBusinessDagStage(input.stage);
  return {
    canFit: true,
    canSendToDag: serviced && canSendToDag(input.stage as TyreLifecycleStage),
    canDispose: serviced && businessStage,
  };
}

export function fitActionLabel(
  actions: TyreLifecycleActions,
): "Fit" | "Fit again" | null {
  if (!actions.canFit) return null;
  if (actions.canSendToDag || actions.canDispose) return "Fit again";
  return "Fit";
}

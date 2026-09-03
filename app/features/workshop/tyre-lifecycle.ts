import {
  BUSINESS_DAG_STAGES,
  DAG_ELIGIBLE_STAGES,
  DAG_STAGE_PROGRESSION,
  type TyreLifecycleStage,
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

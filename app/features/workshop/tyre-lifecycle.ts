import { DAG_STAGE_ORDER, type TyreLifecycleStage } from "./constants";

export function nextDagStage(current: TyreLifecycleStage): TyreLifecycleStage {
  const index = DAG_STAGE_ORDER.indexOf(current);
  if (index < 0 || current === "SCRAP") return "SCRAP";
  return DAG_STAGE_ORDER[index + 1] ?? "SCRAP";
}

export function canSendToDag(stage: TyreLifecycleStage) {
  return stage !== "SCRAP";
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

import { DAG_STAGE_ORDER, type TyreLifecycleStage } from "./constants";

export function nextDagStage(current: TyreLifecycleStage): TyreLifecycleStage {
  const index = DAG_STAGE_ORDER.indexOf(current);
  if (index < 0 || current === "SCRAP") return "SCRAP";
  return DAG_STAGE_ORDER[index + 1] ?? "SCRAP";
}

export function canSendToDag(stage: TyreLifecycleStage) {
  return stage !== "SCRAP";
}

export function receiveIsScrap(stage: TyreLifecycleStage) {
  return nextDagStage(stage) === "SCRAP";
}

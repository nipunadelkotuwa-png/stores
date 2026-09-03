export const TYRE_POSITIONS = [
  "FL",
  "FR",
  "RLI",
  "RLO",
  "RRI",
  "RRO",
  "SPARE",
] as const;

export type TyrePosition = (typeof TYRE_POSITIONS)[number];

export const TYRE_POSITION_LABELS: Record<TyrePosition, string> = {
  FL: "Front left",
  FR: "Front right",
  RLI: "Rear left inner",
  RLO: "Rear left outer",
  RRI: "Rear right inner",
  RRO: "Rear right outer",
  SPARE: "Spare",
};

export const TYRE_STAGES = [
  "ORG",
  "DAG1",
  "DAG2",
  "DAG3",
  "REBUILD",
  "SCRAP",
] as const;

export type TyreLifecycleStage = (typeof TYRE_STAGES)[number];

export const USABLE_TYRE_STAGES = [
  "ORG",
  "DAG1",
  "DAG2",
  "DAG3",
  "REBUILD",
] as const;

export type UsableTyreStage = (typeof USABLE_TYRE_STAGES)[number];

/** Stages shown in normal business UI (hide REBUILD). */
export const BUSINESS_DAG_STAGES = ["ORG", "DAG1", "DAG2", "DAG3"] as const;

export type BusinessDagStage = (typeof BUSINESS_DAG_STAGES)[number];

/** Stages that may be sent to DAG (max three successful cycles). */
export const DAG_ELIGIBLE_STAGES = ["ORG", "DAG1", "DAG2"] as const;

export const DAG_STAGE_PROGRESSION: Partial<
  Record<TyreLifecycleStage, TyreLifecycleStage>
> = {
  ORG: "DAG1",
  DAG1: "DAG2",
  DAG2: "DAG3",
};

export const DAG_STAGE_ORDER: TyreLifecycleStage[] = [
  "ORG",
  "DAG1",
  "DAG2",
  "DAG3",
  "REBUILD",
  "SCRAP",
];

export const UNUSUAL_ISSUE_THRESHOLD = 3;
export const UNUSUAL_ISSUE_WINDOW_DAYS = 30;

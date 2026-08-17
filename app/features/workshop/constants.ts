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

export const TYRE_STAGES = ["ORG", "DAG1", "DAG2", "DAG3", "SCRAP"] as const;

export type TyreLifecycleStage = (typeof TYRE_STAGES)[number];

export const DAG_STAGE_ORDER: TyreLifecycleStage[] = [
  "ORG",
  "DAG1",
  "DAG2",
  "DAG3",
  "SCRAP",
];

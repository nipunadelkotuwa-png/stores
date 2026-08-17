import {
  TYRE_POSITION_LABELS,
  type TyrePosition,
} from "~/features/workshop/constants";

type FittedSlot = {
  position: TyrePosition;
  tyre: {
    serialNumber: string;
    sku: string;
    stage: string;
  } | null;
};

export function TyreMap({ slots }: { slots: FittedSlot[] }) {
  const byPosition = new Map(slots.map((slot) => [slot.position, slot]));
  const cell = (position: TyrePosition) => {
    const slot = byPosition.get(position);
    const tyre = slot?.tyre;
    return (
      <div className={`tyre-slot ${tyre ? "filled" : ""}`}>
        <span className="tyre-slot-pos">{position}</span>
        <small>{TYRE_POSITION_LABELS[position]}</small>
        {tyre ? (
          <>
            <strong className="mono">{tyre.serialNumber}</strong>
            <span>
              {tyre.sku} · {tyre.stage}
            </span>
          </>
        ) : (
          <span className="muted">Empty</span>
        )}
      </div>
    );
  };

  return (
    <div className="tyre-map">
      <div className="tyre-axle">
        {cell("FL")}
        {cell("FR")}
      </div>
      <div className="tyre-axle dual">
        {cell("RLO")}
        {cell("RLI")}
        {cell("RRI")}
        {cell("RRO")}
      </div>
      <div className="tyre-axle spare">{cell("SPARE")}</div>
    </div>
  );
}

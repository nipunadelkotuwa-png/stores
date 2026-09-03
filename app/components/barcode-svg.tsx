import { useMemo } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeSvg({
  value,
  height = 40,
  width = 1.4,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const markup = useMemo(() => {
    if (!value || typeof document === "undefined") return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue,
        fontSize: 12,
        height,
        width,
        margin: 0,
        background: "transparent",
      });
      return svg.outerHTML;
    } catch {
      return null;
    }
  }, [value, height, width, displayValue]);

  if (!markup) {
    return (
      <span className={className} role="img" aria-label={value}>
        {value}
      </span>
    );
  }

  return (
    <span
      className={className}
      role="img"
      aria-label={value}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

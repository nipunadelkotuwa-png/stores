import { useState, type ReactNode } from "react";
import {
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
} from "~/features/reports/period";

export function ReportPeriodFilter({
  period,
  start,
  end,
  showSort,
  sort,
  sortOptions,
  children,
}: {
  period: ReportPeriod;
  start?: string;
  end?: string;
  showSort?: boolean;
  sort?: string;
  sortOptions?: { value: string; label: string }[];
  children?: ReactNode;
}) {
  const [localPeriod, setLocalPeriod] = useState<ReportPeriod>(period);
  const showCustom = localPeriod === "custom";

  return (
    <div
      className="form-grid"
      style={{
        gridTemplateColumns: children
          ? "1fr 1fr 1fr 1fr auto"
          : showSort
            ? "1fr 1fr 1fr 1fr auto"
            : showCustom
              ? "1fr 1fr 1fr auto"
              : "1fr auto",
        alignItems: "end",
      }}
    >
      <label>
        Period
        <select
          name="period"
          value={localPeriod}
          onChange={(event) =>
            setLocalPeriod(event.target.value as ReportPeriod)
          }
        >
          {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map((key) => (
            <option key={key} value={key}>
              {REPORT_PERIOD_LABELS[key]}
            </option>
          ))}
        </select>
      </label>
      {showCustom ? (
        <>
          <label>
            Start
            <input type="date" name="start" defaultValue={start || ""} required />
          </label>
          <label>
            End
            <input type="date" name="end" defaultValue={end || ""} required />
          </label>
        </>
      ) : null}
      {showSort && sortOptions ? (
        <label>
          Sort
          <select name="sort" defaultValue={sort || sortOptions[0]?.value}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {children}
      <button className="button button-secondary" type="submit">
        Filter
      </button>
    </div>
  );
}

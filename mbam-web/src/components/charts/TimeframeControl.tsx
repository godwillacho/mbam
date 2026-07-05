import { useTranslation } from "react-i18next";
import type { ReportTimeframe } from "../../services/reportService";

const timeframes: ReportTimeframe[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
];

export interface CustomRange {
  start: string;
  end: string;
}

interface TimeframeControlProps {
  value: ReportTimeframe;
  onChange: (value: ReportTimeframe) => void;
  /** Only read/rendered when `value === "custom"`. */
  customRange?: CustomRange;
  onCustomRangeChange?: (range: CustomRange) => void;
}

export default function TimeframeControl({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}: TimeframeControlProps) {
  const { t } = useTranslation();
  const isCustomRangeInverted = Boolean(
    customRange?.start && customRange.end && customRange.end < customRange.start,
  );

  return (
    <div className="timeframe-control-group">
      <div className="timeframe-control" role="group" aria-label="Report timeframe">
        {timeframes.map((timeframe) => (
          <button
            aria-pressed={value === timeframe}
            className={value === timeframe ? "active" : ""}
            key={timeframe}
            onClick={() => onChange(timeframe)}
            type="button"
          >
            {timeframe === "custom"
              ? t("reportsPage.customTimeframe")
              : timeframe[0].toUpperCase() + timeframe.slice(1)}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <div className="timeframe-custom-range">
          <label>
            <span>{t("reportsPage.customRangeStart")}</span>
            <input
              max={customRange?.end || undefined}
              onChange={(event) =>
                onCustomRangeChange?.({
                  start: event.target.value,
                  end: customRange?.end ?? "",
                })
              }
              type="date"
              value={customRange?.start ?? ""}
            />
          </label>
          <label>
            <span>{t("reportsPage.customRangeEnd")}</span>
            <input
              min={customRange?.start || undefined}
              onChange={(event) =>
                onCustomRangeChange?.({
                  start: customRange?.start ?? "",
                  end: event.target.value,
                })
              }
              type="date"
              value={customRange?.end ?? ""}
            />
          </label>
          {isCustomRangeInverted && (
            <span className="timeframe-custom-range-error" role="alert">
              {t("reportsPage.customRangeInvalid")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

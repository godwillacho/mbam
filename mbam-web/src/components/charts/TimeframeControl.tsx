import type { ReportTimeframe } from "../../services/reportService";

const timeframes: ReportTimeframe[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

interface TimeframeControlProps {
  value: ReportTimeframe;
  onChange: (value: ReportTimeframe) => void;
}

export default function TimeframeControl({
  value,
  onChange,
}: TimeframeControlProps) {
  return (
    <div className="timeframe-control" role="group" aria-label="Report timeframe">
      {timeframes.map((timeframe) => (
        <button
          aria-pressed={value === timeframe}
          className={value === timeframe ? "active" : ""}
          key={timeframe}
          onClick={() => onChange(timeframe)}
          type="button"
        >
          {timeframe[0].toUpperCase() + timeframe.slice(1)}
        </button>
      ))}
    </div>
  );
}

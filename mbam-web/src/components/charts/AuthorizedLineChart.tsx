import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportPoint } from "../../services/reportService";

interface AuthorizedLineChartProps {
  points: ReportPoint[];
  label: string;
  quantity?: boolean;
  compact?: boolean;
  valueFormatter?: (value: number) => string;
}

const chartColor = "#236347";

function bucketLabel(bucketStart: string, compact: boolean): string {
  return new Intl.DateTimeFormat(
    undefined,
    compact ? { hour: "numeric" } : { month: "short", day: "numeric" },
  ).format(new Date(bucketStart));
}

function defaultFormatter(value: number): string {
  return value.toLocaleString();
}

export default function AuthorizedLineChart({
  points,
  label,
  quantity = false,
  compact = false,
  valueFormatter = defaultFormatter,
}: AuthorizedLineChartProps) {
  const gradientId = useId();
  const data = useMemo(
    () =>
      points.map((point) => ({
        bucket: bucketLabel(point.bucket_start, compact),
        value: quantity ? point.quantity : point.revenue,
      })),
    [points, quantity, compact],
  );

  return (
    <div
      aria-label={`${label} chart`}
      className={compact ? "authorized-chart compact" : "authorized-chart"}
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={data} margin={compact ? { top: 2, right: 2, bottom: 2, left: 2 } : { top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.32} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {!compact && <CartesianGrid stroke="#E5DED0" vertical={false} />}
          {!compact && (
            <XAxis
              axisLine={false}
              dataKey="bucket"
              tick={{ fill: "#74766F", fontSize: 12 }}
              tickLine={false}
            />
          )}
          {!compact && (
            <YAxis
              axisLine={false}
              tick={{ fill: "#74766F", fontSize: 12 }}
              tickFormatter={valueFormatter}
              tickLine={false}
              width={56}
            />
          )}
          {!compact && (
            <Tooltip
              cursor={{ stroke: chartColor, strokeWidth: 1, strokeDasharray: "4 4" }}
              formatter={(value) => [valueFormatter(Number(value)), label]}
              labelStyle={{ fontWeight: 700, color: "#171A16" }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #E5DED0",
                boxShadow: "0 10px 24px rgba(23, 26, 22, 0.12)",
              }}
            />
          )}
          <Area
            activeDot={compact ? false : { r: 5, fill: chartColor, stroke: "#fff", strokeWidth: 2 }}
            dataKey="value"
            dot={false}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            stroke={chartColor}
            strokeWidth={compact ? 1.75 : 2.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

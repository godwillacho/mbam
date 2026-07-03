import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface PieChartDatum {
  id: string;
  name: string;
  value: number;
}

interface AuthorizedPieChartProps {
  data: PieChartDatum[];
  ariaLabel: string;
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
}

const palette = [
  "#1B4332",
  "#2D6A4F",
  "#40916C",
  "#52B788",
  "#B7791F",
  "#166534",
  "#95D5B2",
  "#74766F",
];

function defaultFormatter(value: number): string {
  return value.toLocaleString();
}

function renderLabel({ percent }: { percent?: number }): string {
  return percent && percent > 0.04 ? `${Math.round(percent * 100)}%` : "";
}

export default function AuthorizedPieChart({
  data,
  ariaLabel,
  emptyLabel,
  valueFormatter = defaultFormatter,
}: AuthorizedPieChartProps) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
  const positiveData = useMemo(() => data.filter((item) => item.value > 0), [data]);

  if (positiveData.length === 0) {
    return (
      <div className="authorized-pie-chart authorized-pie-chart-empty" role="img" aria-label={ariaLabel}>
        {emptyLabel && <p className="card-muted">{emptyLabel}</p>}
      </div>
    );
  }

  return (
    <div aria-label={ariaLabel} className="authorized-pie-chart" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            data={positiveData}
            dataKey="value"
            innerRadius="55%"
            isAnimationActive={false}
            label={renderLabel}
            labelLine={false}
            nameKey="name"
            outerRadius="82%"
            paddingAngle={positiveData.length > 1 ? 2 : 0}
            stroke="#FDFBF7"
            strokeWidth={2}
          >
            {positiveData.map((item, index) => (
              <Cell fill={palette[index % palette.length]} key={item.id} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #E5DED0",
              boxShadow: "0 10px 24px rgba(23, 26, 22, 0.12)",
            }}
            formatter={(value, name) => {
              const numericValue = Number(value);
              const percentage = total > 0 ? Math.round((numericValue / total) * 100) : 0;
              return [`${valueFormatter(numericValue)} (${percentage}%)`, name];
            }}
          />
          <Legend
            iconSize={10}
            iconType="circle"
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 13, fontWeight: 700, color: "#171A16", lineHeight: "22px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { ReportPoint } from "../../services/reportService";

ChartJS.register(
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

interface AuthorizedLineChartProps {
  points: ReportPoint[];
  label: string;
  quantity?: boolean;
  compact?: boolean;
}

export default function AuthorizedLineChart({
  points,
  label,
  quantity = false,
  compact = false,
}: AuthorizedLineChartProps) {
  const values = points.map((point) =>
    quantity ? point.quantity : point.revenue,
  );
  return (
    <div
      className={compact ? "authorized-chart compact" : "authorized-chart"}
      aria-label={`${label} chart`}
      role="img"
    >
      <Line
        data={{
          labels: points.map((point) =>
            new Intl.DateTimeFormat(undefined, compact
              ? { hour: "numeric" }
              : { month: "short", day: "numeric" }).format(
              new Date(point.bucket_start),
            ),
          ),
          datasets: [
            {
              label,
              data: values,
              borderColor: "#236347",
              backgroundColor: "rgba(35, 99, 71, 0.14)",
              fill: true,
              pointRadius: compact ? 0 : 3,
              tension: 0.32,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { display: !compact },
            tooltip: { enabled: !compact },
          },
          scales: {
            x: { display: !compact, grid: { display: false } },
            y: { display: !compact, beginAtZero: true },
          },
        }}
      />
    </div>
  );
}

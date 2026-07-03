import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { NILMLabPointRead } from "../../types/api";

interface NilmOverlayChartProps {
  points: NILMLabPointRead[];
}

export function NilmOverlayChart({ points }: NilmOverlayChartProps) {
  const data = points.map((point) => ({
    ts: new Date(point.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aggregate: point.aggregate_power_w,
    actual: point.actual_power_w,
    predicted: point.predicted_power_w,
  }));

  return (
    <div className="chart-frame chart-frame--nilm">
      <ResponsiveContainer height={390} width="100%">
        <ComposedChart data={data} margin={{ bottom: 10, left: -10, right: 14, top: 12 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
          <XAxis dataKey="ts" minTickGap={26} stroke="#8a94a8" tickLine={false} />
          <YAxis stroke="#8a94a8" tickLine={false} unit=" W" />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid rgba(148,163,184,0.24)",
              borderRadius: 8,
              color: "#f8fafc",
            }}
          />
          <Legend />
          <Line
            dataKey="aggregate"
            dot={false}
            name="Aggregate power"
            stroke="#60a5fa"
            strokeWidth={2}
            type="monotone"
          />
          <Line
            dataKey="actual"
            dot={{ r: 3 }}
            name="Ground truth"
            stroke="#22c55e"
            strokeWidth={2.6}
            type="monotone"
          />
          <Line
            dataKey="predicted"
            dot={false}
            name="Prediction"
            stroke="#f59e0b"
            strokeDasharray="6 5"
            strokeWidth={2.6}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

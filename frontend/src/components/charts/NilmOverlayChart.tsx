import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { NilmChartPoint, NilmOverlayVisibility } from "../../features/nilm/nilmExperiment";

interface NilmOverlayChartProps {
  points: NilmChartPoint[];
  thresholdW: number;
  visibility: NilmOverlayVisibility;
}

export function NilmOverlayChart({ points, thresholdW, visibility }: NilmOverlayChartProps) {
  return (
    <div className="chart-frame chart-frame--nilm">
      <ResponsiveContainer height={390} width="100%">
        <ComposedChart data={points} margin={{ bottom: 10, left: -10, right: 14, top: 12 }}>
          <defs>
            <linearGradient id="nilmErrorFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.26} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
          <XAxis dataKey="label" minTickGap={26} stroke="#8a94a8" tickLine={false} />
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
          <ReferenceLine
            ifOverflow="extendDomain"
            label={{ fill: "#cbd5e1", fontSize: 12, position: "insideTopRight", value: "on threshold" }}
            stroke="rgba(203,213,225,0.42)"
            strokeDasharray="4 5"
            y={thresholdW}
          />
          {visibility.error ? (
            <Area
              dataKey="absoluteError"
              fill="url(#nilmErrorFill)"
              name="Absolute error"
              stroke="#ef4444"
              strokeWidth={1.8}
              type="monotone"
            />
          ) : null}
          {visibility.aggregate ? (
            <Line
              dataKey="aggregate"
              dot={false}
              name="Aggregate power"
              stroke="#60a5fa"
              strokeWidth={2}
              type="monotone"
            />
          ) : null}
          {visibility.actual ? (
            <Line
              dataKey="actual"
              dot={{ r: 3 }}
              name="Ground truth"
              stroke="#22c55e"
              strokeWidth={2.6}
              type="monotone"
            />
          ) : null}
          {visibility.predicted ? (
            <Line
              dataKey="predicted"
              dot={false}
              name="Prediction"
              stroke="#f59e0b"
              strokeDasharray="6 5"
              strokeWidth={2.6}
              type="monotone"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

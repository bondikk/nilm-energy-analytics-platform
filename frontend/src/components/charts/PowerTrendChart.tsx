import {
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
} from "recharts";

import type { EnergyMetricRead } from "../../types/api";

interface PowerTrendChartProps {
  metrics: EnergyMetricRead[];
}

export function PowerTrendChart({ metrics }: PowerTrendChartProps) {
  const data = metrics
    .slice()
    .reverse()
    .map((metric) => ({
      ts: new Date(metric.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      power: metric.active_power_w ?? 0,
      voltage: metric.voltage_v ?? 0,
    }));

  return (
    <div className="chart-frame">
      <ResponsiveContainer height={330} width="100%">
        <AreaChart data={data} margin={{ bottom: 10, left: -18, right: 12, top: 10 }}>
          <defs>
            <linearGradient id="powerFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.38} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
          <XAxis dataKey="ts" minTickGap={34} stroke="#8a94a8" tickLine={false} />
          <YAxis stroke="#8a94a8" tickLine={false} unit=" W" />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid rgba(148,163,184,0.24)",
              borderRadius: 8,
              color: "#f8fafc",
            }}
          />
          <Area
            dataKey="power"
            fill="url(#powerFill)"
            name="Active power"
            stroke="#22c55e"
            strokeWidth={2.4}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

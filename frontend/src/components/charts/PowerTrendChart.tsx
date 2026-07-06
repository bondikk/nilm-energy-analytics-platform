import {
  Area,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
} from "recharts";

import type { EnergyMetricRead, LiveNILMEventRead } from "../../types/api";

interface PowerTrendChartProps {
  metrics: EnergyMetricRead[];
  eventMarkers?: LiveNILMEventRead[];
  signal?: SignalMode;
}

export type SignalMode = "active_power_w" | "apparent_power_va" | "current_a" | "voltage_v";

const SIGNAL_META: Record<SignalMode, { color: string; label: string; unit: string }> = {
  active_power_w: { color: "#22c55e", label: "Active power", unit: " W" },
  apparent_power_va: { color: "#38bdf8", label: "Apparent power", unit: " VA" },
  current_a: { color: "#a78bfa", label: "Current RMS", unit: " A" },
  voltage_v: { color: "#f59e0b", label: "Voltage RMS", unit: " V" },
};

export function PowerTrendChart({
  eventMarkers = [],
  metrics,
  signal = "active_power_w",
}: PowerTrendChartProps) {
  const meta = SIGNAL_META[signal];
  const data = metrics
    .slice()
    .reverse()
    .map((metric) => ({
      ts: formatChartTime(metric.ts),
      active_power_w: metric.active_power_w,
      apparent_power_va: metric.apparent_power_va ?? apparentPower(metric),
      current_a: metric.current_a,
      voltage: metric.voltage_v ?? 0,
      voltage_v: metric.voltage_v,
    }));

  return (
    <div className="chart-frame">
      <ResponsiveContainer height={330} width="100%">
        <AreaChart data={data} margin={{ bottom: 10, left: -18, right: 12, top: 10 }}>
          <defs>
            <linearGradient id="powerFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor={meta.color} stopOpacity={0.38} />
              <stop offset="95%" stopColor={meta.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
          <XAxis dataKey="ts" minTickGap={34} stroke="#8a94a8" tickLine={false} />
          <YAxis stroke="#8a94a8" tickLine={false} unit={meta.unit} />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid rgba(148,163,184,0.24)",
              borderRadius: 8,
              color: "#f8fafc",
            }}
          />
          {eventMarkers.slice(-8).map((event) => (
            <ReferenceLine
              ifOverflow="extendDomain"
              key={event.event_id}
              stroke="rgba(248,250,252,0.38)"
              strokeDasharray="4 4"
              x={formatChartTime(event.ts)}
            />
          ))}
          <Area
            connectNulls
            dataKey={signal}
            fill="url(#powerFill)"
            name={meta.label}
            stroke={meta.color}
            strokeWidth={2.4}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function apparentPower(metric: EnergyMetricRead) {
  if (metric.voltage_v !== null && metric.current_a !== null) {
    return Math.round(metric.voltage_v * metric.current_a * 1000) / 1000;
  }
  return null;
}

function formatChartTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

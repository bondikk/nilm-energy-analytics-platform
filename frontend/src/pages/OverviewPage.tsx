import { Activity, AlertTriangle, Cpu, Gauge, PlugZap, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../app/providers";
import { PowerTrendChart, type SignalMode } from "../components/charts/PowerTrendChart";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusPill } from "../components/ui/StatusPill";
import { buildLiveNilmState } from "../features/nilm/liveNilm";
import { formatWatts } from "../features/nilm/nilmFormat";
import { apiClient } from "../services/apiClient";
import { connectMetricsSocket } from "../services/websocketClient";
import type {
  AnomalyRead,
  DeviceRead,
  EnergyMetricRead,
  EnergySummaryRead,
  HomeRead,
  LiveNILMApplianceEstimateRead,
  LiveNILMSummaryRead,
} from "../types/api";

export function OverviewPage() {
  const { token } = useAuth();
  const [homes, setHomes] = useState<HomeRead[]>([]);
  const [devices, setDevices] = useState<DeviceRead[]>([]);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [summary, setSummary] = useState<EnergySummaryRead | null>(null);
  const [liveNilmSummary, setLiveNilmSummary] = useState<LiveNILMSummaryRead | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("15m");
  const [signalMode, setSignalMode] = useState<SignalMode>("apparent_power_va");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "online" | "offline">(
    "offline",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextHomes = await apiClient.homes(token);
        const firstHome = nextHomes[0];
        const nextDevices = firstHome ? await apiClient.devices(token, firstHome.id) : [];
        const firstDevice = nextDevices[0];
        const [nextSummary, nextMetrics, nextAnomalies, nextLiveNilmSummary] =
          firstHome && firstDevice
            ? await Promise.all([
                apiClient.summary(token, firstHome.id, firstDevice.id),
                apiClient.metrics(token, firstHome.id, firstDevice.id, 180),
                apiClient.anomalies(token, firstHome.id),
                apiClient
                  .liveNilmSummary(token, firstHome.id, firstDevice.id, 500)
                  .catch(() => null),
              ])
            : [null, [] as EnergyMetricRead[], [] as AnomalyRead[], null];
        if (!cancelled) {
          setHomes(nextHomes);
          setDevices(nextDevices);
          setSummary(nextSummary);
          setMetrics(nextMetrics);
          setAnomalies(nextAnomalies);
          setLiveNilmSummary(nextLiveNilmSummary);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load overview");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !homes[0] || !devices[0]) {
      return undefined;
    }

    const selectedHomeId = homes[0].id;
    const selectedDeviceId = devices[0].id;
    const socket = connectMetricsSocket(token, {
      onMetric: (event) => {
        if (event.metric.device_id !== selectedDeviceId) {
          return;
        }
        setMetrics((current) => [event.metric, ...current].slice(0, 240));
        void apiClient
          .liveNilmSummary(token, selectedHomeId, selectedDeviceId, 500)
          .then(setLiveNilmSummary)
          .catch(() => undefined);
      },
      onStatus: setSocketStatus,
    });

    return () => {
      socket.close();
    };
  }, [devices, homes, token]);

  const latestMetric = metrics[0];
  const statusTone = latestMetric ? "success" : "warning";
  const totalEnergy = (summary?.energy_wh_delta_total ?? 0) / 1000;
  const deviceName = devices[0]?.name ?? "No device selected";
  const liveState = useMemo(() => buildLiveNilmState(metrics, anomalies), [anomalies, metrics]);
  const visibleMetrics = useMemo(() => filterMetricsByRange(metrics, timeRange), [metrics, timeRange]);
  const currentPowerW = liveNilmSummary?.current.current_power_w ?? liveState.currentPowerW;
  const latestActivePower = latestMetric?.active_power_w ?? null;
  const latestApparentPower = latestMetric?.apparent_power_va ?? apparentPower(latestMetric);
  const primaryPowerLabel = latestActivePower === null ? "Apparent power" : "Active power";
  const primaryPowerValue = latestActivePower ?? latestApparentPower ?? currentPowerW;
  const voltageEstimated = Boolean(latestMetric?.raw_payload?.voltage_fallback);
  const voltageV = liveNilmSummary?.current.voltage_v ?? liveState.voltageV;
  const currentA = liveNilmSummary?.current.current_a ?? liveState.currentA;
  const baseLoadW = liveNilmSummary?.current.base_load_w ?? liveState.baseLoadW;
  const stepDeltaW = liveNilmSummary?.current.last_event?.step_magnitude_w ?? liveState.stepDeltaW;
  const liveAppliances = liveNilmSummary?.current.appliance_estimates ?? [];
  const topAppliances = liveAppliances.length ? liveAppliances.slice(0, 4) : liveState.activeAppliances.slice(0, 4);

  const cards = useMemo(
    () => [
      {
        label: "Current power",
        value: formatPower(primaryPowerValue, latestActivePower === null ? "VA" : "W"),
        detail: `${primaryPowerLabel} · ${socketStatus === "online" ? "live WebSocket" : "stored reading"}`,
        tone: "green" as const,
        icon: <Zap size={18} />,
      },
      {
        label: "Current RMS",
        value: `${(currentA ?? 0).toFixed(2)} A`,
        detail: "Latest meter current",
        tone: "blue" as const,
        icon: <Activity size={18} />,
      },
      {
        label: "Voltage RMS",
        value: `${Math.round(voltageV ?? 0)} V`,
        detail: voltageEstimated ? "estimated fallback voltage" : "latest measured voltage",
        tone: "blue" as const,
        icon: <PlugZap size={18} />,
      },
      {
        label: "Today energy",
        value: `${totalEnergy.toFixed(2)} kWh`,
        detail: `${summary?.sample_count ?? 0} readings`,
        tone: "green" as const,
        icon: <Gauge size={18} />,
      },
      {
        label: "Peak power",
        value: formatPower(liveNilmSummary?.signal.max_power_w ?? summary?.active_power_w_max ?? 0, "W"),
        detail: `${timeRange} selected range`,
        tone: "amber" as const,
        icon: <Gauge size={18} />,
      },
      {
        label: "Detected now",
        value: String(topAppliances.filter((item) => item.state === "active").length),
        detail: `base load ${formatWatts(baseLoadW)}`,
        tone: "amber" as const,
        icon: <Cpu size={18} />,
      },
    ],
    [
      baseLoadW,
      currentA,
      latestActivePower,
      latestApparentPower,
      liveNilmSummary,
      primaryPowerLabel,
      primaryPowerValue,
      socketStatus,
      summary,
      timeRange,
      topAppliances,
      totalEnergy,
      voltageEstimated,
      voltageV,
    ],
  );

  if (loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!homes.length) {
    return (
      <EmptyState
        message="Seed a workspace in Simulator or create homes through the API to start collecting telemetry."
        title="No homes yet"
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="insight-strip">
        <div>
          <span className="eyebrow">Live monitoring</span>
          <h2>{homes[0].name}</h2>
          <p>
            {deviceName} · last update {latestMetric ? formatDateTime(latestMetric.ts) : "waiting"}
          </p>
        </div>
        <div className="dataset-live-controls">
          <StatusPill tone={socketStatus === "online" ? "success" : undefined}>
            {socketStatus === "online" ? "Realtime connected" : "Realtime waiting"}
          </StatusPill>
          <StatusPill tone={statusTone}>{latestMetric ? "Telemetry online" : "Waiting for data"}</StatusPill>
        </div>
      </section>

      <section className="metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="dashboard-live-grid">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Main live signal</span>
              <h2>Power trend</h2>
            </div>
            <StatusPill>{deviceName}</StatusPill>
          </div>
          <div className="chart-toolbar">
            <div className="segmented-control" aria-label="Time range">
              {TIME_RANGES.map((range) => (
                <button
                  className={timeRange === range.id ? "is-active" : ""}
                  key={range.id}
                  onClick={() => setTimeRange(range.id)}
                  type="button"
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div className="segmented-control" aria-label="Signal">
              {SIGNAL_OPTIONS.map((option) => (
                <button
                  className={signalMode === option.id ? "is-active" : ""}
                  disabled={option.id === "active_power_w" && !metrics.some((metric) => metric.active_power_w !== null)}
                  key={option.id}
                  onClick={() => setSignalMode(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {metrics.length ? (
            <PowerTrendChart
              eventMarkers={liveNilmSummary?.events ?? []}
              metrics={visibleMetrics}
              signal={signalMode}
            />
          ) : (
            <EmptyState
              message="The selected device has no measurements yet. Use the simulator to publish metrics."
              title="No telemetry samples"
            />
          )}
        </article>

        <LiveDisaggregationPanel
          appliances={topAppliances}
          qualityFlags={liveNilmSummary?.signal.quality_flags ?? []}
          sourceSignal={liveNilmSummary?.signal.source_signal ?? "local fallback"}
          stepDeltaW={stepDeltaW}
        />
      </section>

      <section className="dashboard-live-grid dashboard-live-grid--secondary">
        <RecentReadingsPanel deviceName={deviceName} metrics={metrics.slice(0, 6)} />
        <RecentAnomaliesPanel anomalies={anomalies.slice(0, 4)} />
      </section>
    </div>
  );
}

function LiveDisaggregationPanel({
  appliances,
  qualityFlags,
  sourceSignal,
  stepDeltaW,
}: {
  appliances: Array<LiveNILMApplianceEstimateRead | ReturnType<typeof buildLiveNilmState>["activeAppliances"][number]>;
  qualityFlags: string[];
  sourceSignal: string;
  stepDeltaW: number;
}) {
  return (
    <article className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Live NILM</span>
          <h2>Current disaggregation</h2>
        </div>
        <StatusPill tone={Math.abs(stepDeltaW) >= 60 ? "success" : undefined}>
          step {formatWatts(stepDeltaW)}
        </StatusPill>
      </div>
      <div className="appliance-estimate-list">
        {appliances.map((appliance) => (
          <div
            className={`appliance-estimate is-${appliance.state}`}
            key={"id" in appliance ? appliance.id : appliance.appliance}
          >
            <div>
              <strong>{appliance.label}</strong>
              <span>{"reason" in appliance ? appliance.reason : appliance.explanation}</span>
            </div>
            <div>
              <b>{Math.round(appliance.confidence * 100)}%</b>
              <small>
                {formatWatts(
                  "estimatedPowerW" in appliance
                    ? appliance.estimatedPowerW
                    : appliance.estimated_power_w,
                )}
              </small>
            </div>
          </div>
        ))}
      </div>
      <p className="muted">
        Source: {sourceSignal}. {qualityFlags[0] ?? "Heuristic step-based estimate for live monitoring."}
      </p>
    </article>
  );
}

function RecentReadingsPanel({
  deviceName,
  metrics,
}: {
  deviceName: string;
  metrics: EnergyMetricRead[];
}) {
  return (
    <article className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Latest readings</span>
          <h2>Telemetry stream</h2>
        </div>
        <StatusPill>{metrics.length} rows</StatusPill>
      </div>
      <div className="table-wrap">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>Time</th>
              <th>Device</th>
              <th>Current</th>
              <th>Power</th>
              <th>Voltage</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={`${metric.device_id}-${metric.ts}`}>
                <td>{formatDateTime(metric.ts)}</td>
                <td>{deviceName}</td>
                <td>{(metric.current_a ?? 0).toFixed(2)} A</td>
                <td>
                  {metric.active_power_w === null
                    ? formatPower(metric.apparent_power_va ?? apparentPower(metric) ?? 0, "VA")
                    : formatPower(metric.active_power_w, "W")}
                </td>
                <td>{Math.round(metric.voltage_v ?? 0)} V</td>
                <td>{metric.active_power_w === null ? "apparent" : "active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RecentAnomaliesPanel({ anomalies }: { anomalies: AnomalyRead[] }) {
  return (
    <article className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Problems</span>
          <h2>Recent anomalies</h2>
        </div>
        <StatusPill tone={anomalies.length ? "warning" : "success"}>{anomalies.length} open</StatusPill>
      </div>
      {anomalies.length ? (
        <div className="event-list">
          {anomalies.map((anomaly) => (
            <article className="event-row" key={anomaly.id}>
              <div className="event-row__icon">
                <AlertTriangle size={17} />
              </div>
              <div>
                <strong>{anomaly.title}</strong>
                <span>{anomaly.description ?? anomaly.anomaly_type}</span>
              </div>
              <StatusPill tone={anomaly.severity === "critical" ? "danger" : "warning"}>
                {anomaly.status}
              </StatusPill>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No open anomalies for the current home." title="Signal looks normal" />
      )}
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

type TimeRange = "2m" | "5m" | "15m" | "1h" | "24h";

const TIME_RANGES: Array<{ id: TimeRange; label: string; minutes: number }> = [
  { id: "2m", label: "2m", minutes: 2 },
  { id: "5m", label: "5m", minutes: 5 },
  { id: "15m", label: "15m", minutes: 15 },
  { id: "1h", label: "1h", minutes: 60 },
  { id: "24h", label: "24h", minutes: 1440 },
];

const SIGNAL_OPTIONS: Array<{ id: SignalMode; label: string }> = [
  { id: "apparent_power_va", label: "VA" },
  { id: "current_a", label: "A" },
  { id: "voltage_v", label: "V" },
  { id: "active_power_w", label: "W" },
];

function filterMetricsByRange(metrics: EnergyMetricRead[], range: TimeRange) {
  const selected = TIME_RANGES.find((item) => item.id === range) ?? TIME_RANGES[2];
  const newestTs = metrics[0]?.ts ? new Date(metrics[0].ts).getTime() : Date.now();
  const cutoff = newestTs - selected.minutes * 60 * 1000;
  const filtered = metrics.filter((metric) => new Date(metric.ts).getTime() >= cutoff);
  return filtered.length >= 2 ? filtered : metrics;
}

function apparentPower(metric: EnergyMetricRead | undefined) {
  if (!metric || metric.voltage_v === null || metric.current_a === null) {
    return null;
  }
  return metric.voltage_v * metric.current_a;
}

function formatPower(value: number, unit: "W" | "VA") {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)} k${unit}`;
  }
  return `${Math.round(value)} ${unit}`;
}

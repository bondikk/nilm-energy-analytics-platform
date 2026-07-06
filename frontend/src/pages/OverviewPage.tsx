import { Activity, AlertTriangle, Cpu, Gauge, PlugZap, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../app/providers";
import { PowerTrendChart } from "../components/charts/PowerTrendChart";
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
} from "../types/api";

export function OverviewPage() {
  const { token } = useAuth();
  const [homes, setHomes] = useState<HomeRead[]>([]);
  const [devices, setDevices] = useState<DeviceRead[]>([]);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [summary, setSummary] = useState<EnergySummaryRead | null>(null);
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
        const [nextSummary, nextMetrics, nextAnomalies] =
          firstHome && firstDevice
            ? await Promise.all([
                apiClient.summary(token, firstHome.id, firstDevice.id),
                apiClient.metrics(token, firstHome.id, firstDevice.id, 180),
                apiClient.anomalies(token, firstHome.id),
              ])
            : [null, [] as EnergyMetricRead[], [] as AnomalyRead[]];
        if (!cancelled) {
          setHomes(nextHomes);
          setDevices(nextDevices);
          setSummary(nextSummary);
          setMetrics(nextMetrics);
          setAnomalies(nextAnomalies);
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
    if (!token || !devices[0]) {
      return undefined;
    }

    const selectedDeviceId = devices[0].id;
    const socket = connectMetricsSocket(token, {
      onMetric: (event) => {
        if (event.metric.device_id !== selectedDeviceId) {
          return;
        }
        setMetrics((current) => [event.metric, ...current].slice(0, 240));
      },
      onStatus: setSocketStatus,
    });

    return () => {
      socket.close();
    };
  }, [devices, token]);

  const latestMetric = metrics[0];
  const statusTone = latestMetric ? "success" : "warning";
  const totalEnergy = (summary?.energy_wh_delta_total ?? 0) / 1000;
  const deviceName = devices[0]?.name ?? "No device selected";
  const liveState = useMemo(() => buildLiveNilmState(metrics, anomalies), [anomalies, metrics]);
  const topAppliances = liveState.activeAppliances.slice(0, 4);

  const cards = useMemo(
    () => [
      {
        label: "Current power",
        value: formatWatts(liveState.currentPowerW),
        detail: socketStatus === "online" ? "live WebSocket connected" : "last stored reading",
        tone: "green" as const,
        icon: <Zap size={18} />,
      },
      {
        label: "Voltage",
        value: `${Math.round(liveState.voltageV)} V`,
        detail: `${liveState.currentA.toFixed(2)} A current`,
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
        label: "Detected now",
        value: String(topAppliances.filter((item) => item.state === "active").length),
        detail: `base load ${formatWatts(liveState.baseLoadW)}`,
        tone: "amber" as const,
        icon: <Cpu size={18} />,
      },
    ],
    [liveState, socketStatus, summary, topAppliances, totalEnergy],
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
          {metrics.length ? (
            <PowerTrendChart metrics={metrics} />
          ) : (
            <EmptyState
              message="The selected device has no measurements yet. Use the simulator to publish metrics."
              title="No telemetry samples"
            />
          )}
        </article>

        <LiveDisaggregationPanel appliances={topAppliances} stepDeltaW={liveState.stepDeltaW} />
      </section>

      <section className="dashboard-live-grid dashboard-live-grid--secondary">
        <RecentReadingsPanel metrics={metrics.slice(0, 6)} />
        <RecentAnomaliesPanel anomalies={anomalies.slice(0, 4)} />
      </section>
    </div>
  );
}

function LiveDisaggregationPanel({
  appliances,
  stepDeltaW,
}: {
  appliances: ReturnType<typeof buildLiveNilmState>["activeAppliances"];
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
          <div className={`appliance-estimate is-${appliance.state}`} key={appliance.id}>
            <div>
              <strong>{appliance.label}</strong>
              <span>{appliance.reason}</span>
            </div>
            <div>
              <b>{Math.round(appliance.confidence * 100)}%</b>
              <small>{formatWatts(appliance.estimatedPowerW)}</small>
            </div>
          </div>
        ))}
      </div>
      <p className="muted">
        Heuristic step-based estimate for live monitoring. Dataset-grade evaluation stays in NILM Lab.
      </p>
    </article>
  );
}

function RecentReadingsPanel({ metrics }: { metrics: EnergyMetricRead[] }) {
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
              <th>Power</th>
              <th>Voltage</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={`${metric.device_id}-${metric.ts}`}>
                <td>{formatDateTime(metric.ts)}</td>
                <td>{formatWatts(metric.active_power_w ?? metric.apparent_power_va ?? 0)}</td>
                <td>{Math.round(metric.voltage_v ?? 0)} V</td>
                <td>{(metric.current_a ?? 0).toFixed(2)} A</td>
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

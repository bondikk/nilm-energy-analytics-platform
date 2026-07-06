import { Activity, Cpu, Gauge, Target, Zap } from "lucide-react";
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
import type { AnomalyRead, DeviceRead, EnergyMetricRead, HomeRead } from "../types/api";

export function AnalyticsPage() {
  const { token } = useAuth();
  const [home, setHome] = useState<HomeRead | null>(null);
  const [device, setDevice] = useState<DeviceRead | null>(null);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const homes = await apiClient.homes(token);
        const selectedHome = homes[0] ?? null;
        const devices = selectedHome ? await apiClient.devices(token, selectedHome.id) : [];
        const selectedDevice = devices[0] ?? null;
        const [nextMetrics, nextAnomalies] =
          selectedHome && selectedDevice
            ? await Promise.all([
                apiClient.metrics(token, selectedHome.id, selectedDevice.id, 500),
                apiClient.anomalies(token, selectedHome.id),
              ])
            : [[] as EnergyMetricRead[], [] as AnomalyRead[]];
        if (!cancelled) {
          setHome(selectedHome);
          setDevice(selectedDevice);
          setMetrics(nextMetrics);
          setAnomalies(nextAnomalies);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load analytics");
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

  const liveState = useMemo(() => buildLiveNilmState(metrics, anomalies), [anomalies, metrics]);
  const activeAppliances = liveState.activeAppliances.filter((item) => item.state !== "idle");

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!home || !device || !metrics.length) {
    return (
      <EmptyState
        message="Analytics will appear after a home, device, and measurements are available."
        title="No analytics data"
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="insight-strip">
        <div>
          <span className="eyebrow">Live signal interpretation</span>
          <h2>Live NILM</h2>
          <p>
            {home.name} · {device.name} · heuristic appliance signatures over recent telemetry.
          </p>
        </div>
        <StatusPill tone="success">{metrics.length} readings</StatusPill>
      </section>

      <section className="metric-grid">
        <MetricCard
          detail="Latest active/apparent reading"
          icon={<Zap size={18} />}
          label="Current signal"
          tone="green"
          value={formatWatts(liveState.currentPowerW)}
        />
        <MetricCard
          detail="Latest point-to-point signal change"
          icon={<Activity size={18} />}
          label="Step delta"
          tone={Math.abs(liveState.stepDeltaW) >= 60 ? "amber" : "blue"}
          value={formatWatts(liveState.stepDeltaW)}
        />
        <MetricCard
          detail="Minimum recent observed load"
          icon={<Gauge size={18} />}
          label="Base load"
          value={formatWatts(liveState.baseLoadW)}
        />
        <MetricCard
          detail="Active or possible signatures"
          icon={<Cpu size={18} />}
          label="Likely appliances"
          tone="blue"
          value={String(activeAppliances.length)}
        />
      </section>

      <section className="dashboard-live-grid">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Signal</span>
              <h2>Live power profile</h2>
            </div>
            <StatusPill>{device.external_id}</StatusPill>
          </div>
          <PowerTrendChart metrics={metrics} />
        </article>

        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Disaggregation</span>
              <h2>Likely active loads</h2>
            </div>
            <Target size={18} />
          </div>
          <div className="appliance-estimate-list">
            {liveState.activeAppliances.map((appliance) => (
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
        </article>
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">How to read this</span>
            <h2>Live NILM method</h2>
          </div>
        </div>
        <dl className="definition-list">
          <div>
            <dt>Input signal</dt>
            <dd>Recent live telemetry from the selected meter, using active power when available.</dd>
          </div>
          <div>
            <dt>Detection logic</dt>
            <dd>Step magnitude and current load are compared with simple appliance power signatures.</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>Higher confidence means the latest step/load is closer to a known signature range.</dd>
          </div>
          <div>
            <dt>Limitations</dt>
            <dd>This is an online heuristic for monitoring, not dataset-validated production NILM.</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

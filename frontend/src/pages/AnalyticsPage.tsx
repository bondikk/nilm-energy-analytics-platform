import { Activity, Cpu, Gauge, RadioTower, Target, Zap } from "lucide-react";
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
import type {
  AnomalyRead,
  DeviceRead,
  EnergyMetricRead,
  HomeRead,
  LiveNILMSummaryRead,
} from "../types/api";

export function AnalyticsPage() {
  const { token } = useAuth();
  const [home, setHome] = useState<HomeRead | null>(null);
  const [device, setDevice] = useState<DeviceRead | null>(null);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [liveNilmSummary, setLiveNilmSummary] = useState<LiveNILMSummaryRead | null>(null);
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
        const [nextMetrics, nextAnomalies, nextLiveNilmSummary] =
          selectedHome && selectedDevice
            ? await Promise.all([
                apiClient.metrics(token, selectedHome.id, selectedDevice.id, 500),
                apiClient.anomalies(token, selectedHome.id),
                apiClient.liveNilmSummary(token, selectedHome.id, selectedDevice.id, 500),
              ])
            : [[] as EnergyMetricRead[], [] as AnomalyRead[], null];
        if (!cancelled) {
          setHome(selectedHome);
          setDevice(selectedDevice);
          setMetrics(nextMetrics);
          setAnomalies(nextAnomalies);
          setLiveNilmSummary(nextLiveNilmSummary);
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
  const activeAppliances =
    liveNilmSummary?.current.appliance_estimates ??
    liveState.activeAppliances.filter((item) => item.state !== "idle");
  const signal = liveNilmSummary?.signal;
  const events = liveNilmSummary?.events ?? [];
  const currentPowerW = liveNilmSummary?.current.current_power_w ?? liveState.currentPowerW;
  const stepDeltaW = liveNilmSummary?.current.last_event?.step_magnitude_w ?? liveState.stepDeltaW;
  const baseLoadW = liveNilmSummary?.current.base_load_w ?? liveState.baseLoadW;

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
            {home.name} · {device.name} · realtime step detection and appliance estimates.
          </p>
        </div>
        <StatusPill tone="success">{signal?.sample_count ?? metrics.length} readings</StatusPill>
      </section>

      <section className="metric-grid">
        <MetricCard
          detail="Latest active/apparent reading"
          icon={<Zap size={18} />}
          label="Current signal"
          tone="green"
          value={formatWatts(currentPowerW)}
        />
        <MetricCard
          detail="Latest point-to-point signal change"
          icon={<Activity size={18} />}
          label="Step delta"
          tone={Math.abs(stepDeltaW) >= 60 ? "amber" : "blue"}
          value={formatWatts(stepDeltaW)}
        />
        <MetricCard
          detail="Minimum recent observed load"
          icon={<Gauge size={18} />}
          label="Base load"
          value={formatWatts(baseLoadW)}
        />
        <MetricCard
          detail={`${events.length} detected step events`}
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
            {activeAppliances.map((appliance) => (
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
        </article>
      </section>

      <section className="dashboard-live-grid dashboard-live-grid--secondary">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Detailed signal analysis</span>
              <h2>Signal quality</h2>
            </div>
            <RadioTower size={18} />
          </div>
          <dl className="definition-list">
            <div>
              <dt>Source signal</dt>
              <dd>{signal?.source_signal ?? "local fallback"}</dd>
            </div>
            <div>
              <dt>Power range</dt>
              <dd>
                {formatWatts(signal?.min_power_w ?? 0)} - {formatWatts(signal?.max_power_w ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Peak over base</dt>
              <dd>{formatWatts(signal?.peak_to_base_w ?? 0)}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>{signal?.quality_flags[0] ?? "Using frontend fallback until API data arrives."}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Event timeline</span>
              <h2>Detected step events</h2>
            </div>
            <StatusPill>{events.length} events</StatusPill>
          </div>
          {events.length ? (
            <div className="event-list">
              {events.slice(-6).reverse().map((event) => (
                <article className="event-row" key={event.event_id}>
                  <div className="event-row__icon">
                    <Activity size={17} />
                  </div>
                  <div>
                    <strong>
                      {event.direction.toUpperCase()} · {event.estimated_appliance.replace(/_/g, " ")}
                    </strong>
                    <span>{event.explanation}</span>
                  </div>
                  <StatusPill tone={event.direction === "on" ? "success" : undefined}>
                    {formatWatts(event.step_magnitude_w)}
                  </StatusPill>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No significant load edges were detected in the recent signal." title="No step events" />
          )}
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

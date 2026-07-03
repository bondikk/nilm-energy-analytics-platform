import { Activity, Gauge, Home, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../app/providers";
import { PowerTrendChart } from "../components/charts/PowerTrendChart";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusPill } from "../components/ui/StatusPill";
import { apiClient } from "../services/apiClient";
import type { DeviceRead, EnergyMetricRead, EnergySummaryRead, HomeRead } from "../types/api";

export function OverviewPage() {
  const { token } = useAuth();
  const [homes, setHomes] = useState<HomeRead[]>([]);
  const [devices, setDevices] = useState<DeviceRead[]>([]);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [summary, setSummary] = useState<EnergySummaryRead | null>(null);
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
        const [nextSummary, nextMetrics] =
          firstHome && firstDevice
            ? await Promise.all([
                apiClient.summary(token, firstHome.id, firstDevice.id),
                apiClient.metrics(token, firstHome.id, firstDevice.id, 180),
              ])
            : [null, [] as EnergyMetricRead[]];
        if (!cancelled) {
          setHomes(nextHomes);
          setDevices(nextDevices);
          setSummary(nextSummary);
          setMetrics(nextMetrics);
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

  const latestMetric = metrics[0];
  const statusTone = latestMetric ? "success" : "warning";
  const totalEnergy = (summary?.energy_wh_delta_total ?? 0) / 1000;
  const deviceName = devices[0]?.name ?? "No device selected";

  const cards = useMemo(
    () => [
      {
        label: "Energy",
        value: `${totalEnergy.toFixed(2)} kWh`,
        detail: `${summary?.sample_count ?? 0} readings`,
        tone: "green" as const,
        icon: <Zap size={18} />,
      },
      {
        label: "Average power",
        value: `${Math.round(summary?.active_power_w_avg ?? 0)} W`,
        detail: deviceName,
        tone: "blue" as const,
        icon: <Gauge size={18} />,
      },
      {
        label: "Peak power",
        value: `${Math.round(summary?.active_power_w_max ?? 0)} W`,
        detail: `${Math.round(summary?.active_power_w_min ?? 0)} W min`,
        tone: "amber" as const,
        icon: <Activity size={18} />,
      },
      {
        label: "Homes",
        value: String(homes.length),
        detail: `${devices.length} devices loaded`,
        tone: "blue" as const,
        icon: <Home size={18} />,
      },
    ],
    [deviceName, devices.length, homes.length, summary, totalEnergy],
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
          <span className="eyebrow">Operational snapshot</span>
          <h2>{homes[0].name}</h2>
          <p>{homes[0].location_label ?? homes[0].timezone}</p>
        </div>
        <StatusPill tone={statusTone}>{latestMetric ? "Telemetry online" : "Waiting for data"}</StatusPill>
      </section>

      <section className="metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Main signal</span>
            <h2>Active power trend</h2>
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
      </section>
    </div>
  );
}

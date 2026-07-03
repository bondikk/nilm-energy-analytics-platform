import { useEffect, useState } from "react";

import { useAuth } from "../app/providers";
import { PowerTrendChart } from "../components/charts/PowerTrendChart";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { apiClient } from "../services/apiClient";
import type { DeviceRead, EnergyMetricRead, HomeRead } from "../types/api";

export function AnalyticsPage() {
  const { token } = useAuth();
  const [home, setHome] = useState<HomeRead | null>(null);
  const [device, setDevice] = useState<DeviceRead | null>(null);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
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
        const nextMetrics =
          selectedHome && selectedDevice
            ? await apiClient.metrics(token, selectedHome.id, selectedDevice.id, 500)
            : [];
        if (!cancelled) {
          setHome(selectedHome);
          setDevice(selectedDevice);
          setMetrics(nextMetrics);
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
    <section className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">{home.name}</span>
          <h2>{device.name} telemetry</h2>
        </div>
        <span className="panel-count">{metrics.length} readings</span>
      </div>
      <PowerTrendChart metrics={metrics} />
    </section>
  );
}

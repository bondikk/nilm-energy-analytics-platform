import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../app/providers";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { apiClient } from "../services/apiClient";
import type { AnomalyRead } from "../types/api";

export function AnomaliesPage() {
  const { token } = useAuth();
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
        const home = homes[0];
        const nextAnomalies = home ? await apiClient.anomalies(token, home.id) : [];
        if (!cancelled) {
          setAnomalies(nextAnomalies);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load anomalies");
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

  if (!anomalies.length) {
    return (
      <EmptyState
        message="No anomalies are currently open for the selected workspace."
        title="No anomaly events"
      />
    );
  }

  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Operations queue</span>
          <h2>Anomaly review</h2>
        </div>
        <StatusPill tone="warning">{anomalies.length} events</StatusPill>
      </div>
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
    </section>
  );
}

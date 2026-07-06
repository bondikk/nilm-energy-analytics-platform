import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../app/providers";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { apiClient } from "../services/apiClient";
import type { AnomalyRead, UUID } from "../types/api";

export function AnomaliesPage() {
  const { token } = useAuth();
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [homeId, setHomeId] = useState<UUID | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
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
          setHomeId(home?.id ?? null);
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

  async function updateStatus(anomaly: AnomalyRead, status: "acknowledged" | "resolved") {
    if (!homeId) {
      return;
    }
    setBusyId(anomaly.id);
    setError("");
    try {
      const updated = await apiClient.updateAnomaly(token, homeId, anomaly.id, {
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : undefined,
      });
      setAnomalies((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update anomaly");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="page-stack">
      <section className="insight-strip">
        <div>
          <span className="eyebrow">Event detection</span>
          <h2>Anomalies</h2>
          <p>Review detected load events, severity, likely cause, and operational next step.</p>
        </div>
        <StatusPill tone="warning">{anomalies.length} events</StatusPill>
      </section>

      <section className="anomaly-review-grid">
        {anomalies.map((anomaly) => (
          <article className="panel anomaly-card" key={anomaly.id}>
            <div className="panel__heading">
              <div>
                <span className="eyebrow">{formatDateTime(anomaly.detected_at)}</span>
                <h2>{anomaly.title}</h2>
              </div>
              <StatusPill tone={anomaly.severity === "critical" ? "danger" : "warning"}>
                {anomaly.severity}
              </StatusPill>
            </div>

            <p>{anomaly.description ?? "A NILM event crossed the configured detection threshold."}</p>

            <dl className="detected-signal-grid">
              <div>
                <dt>Status</dt>
                <dd>{anomaly.status}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatPercent(anomaly.score)}</dd>
              </div>
              <div>
                <dt>Event class</dt>
                <dd>{formatEventClass(anomaly)}</dd>
              </div>
              <div>
                <dt>Signal delta</dt>
                <dd>{formatSignalDelta(anomaly)}</dd>
              </div>
              <div>
                <dt>Likely cause</dt>
                <dd>{likelyCause(anomaly)}</dd>
              </div>
              <div>
                <dt>Next step</dt>
                <dd>{recommendedAction(anomaly)}</dd>
              </div>
            </dl>

            <div className="button-row">
              <button
                className="button button--secondary"
                disabled={busyId === anomaly.id || anomaly.status !== "open"}
                onClick={() => updateStatus(anomaly, "acknowledged")}
                type="button"
              >
                <CheckCircle2 size={16} />
                Acknowledge
              </button>
              <button
                className="button"
                disabled={busyId === anomaly.id || anomaly.status === "resolved"}
                onClick={() => updateStatus(anomaly, "resolved")}
                type="button"
              >
                <Gauge size={16} />
                Resolve
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

function formatSignalDelta(anomaly: AnomalyRead) {
  const metadata = anomaly.metadata_json ?? {};
  const delta = metadata.delta_w ?? metadata.active_power_w;
  return typeof delta === "number" ? `${Math.round(delta).toLocaleString()} W` : "-";
}

function formatEventClass(anomaly: AnomalyRead) {
  const metadata = anomaly.metadata_json ?? {};
  const signature = metadata.signature ?? metadata.event_signature ?? anomaly.anomaly_type;
  return String(signature).replace(/_/g, " ");
}

function likelyCause(anomaly: AnomalyRead) {
  const eventClass = formatEventClass(anomaly);
  if (eventClass.includes("resistive")) {
    return "Kettle, heater, oven, or similar high-power load.";
  }
  if (eventClass.includes("flexible")) {
    return "Washing machine, dishwasher, or appliance cycle.";
  }
  if (eventClass.includes("compressor")) {
    return "Fridge, freezer, or HVAC compressor cycle.";
  }
  return "Inspect loads active around the event timestamp.";
}

function recommendedAction(anomaly: AnomalyRead) {
  if (anomaly.severity === "critical") {
    return "Inspect the device and mark resolved only after checking the signal.";
  }
  if (anomaly.status === "open") {
    return "Acknowledge after review, then compare with nearby live readings.";
  }
  return "Keep for audit trail or resolve after the cause is understood.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

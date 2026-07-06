import { Activity, AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../app/providers";
import { PowerTrendChart } from "../components/charts/PowerTrendChart";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { apiClient } from "../services/apiClient";
import type { AnomalyRead, EnergyMetricRead, LiveNILMEventRead, UUID } from "../types/api";

export function AnomaliesPage() {
  const { token } = useAuth();
  const [anomalies, setAnomalies] = useState<AnomalyRead[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveNILMEventRead[]>([]);
  const [metrics, setMetrics] = useState<EnergyMetricRead[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventSelection | null>(null);
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
        const devices = home ? await apiClient.devices(token, home.id) : [];
        const device = devices[0];
        const [nextAnomalies, nextLiveEvents, nextMetrics] =
          home && device
            ? await Promise.all([
                apiClient.anomalies(token, home.id),
                apiClient.liveNilmEvents(token, home.id, device.id, 500).catch(() => []),
                apiClient.metrics(token, home.id, device.id, 500),
              ])
            : [home ? await apiClient.anomalies(token, home.id) : [], [] as LiveNILMEventRead[], [] as EnergyMetricRead[]];
        if (!cancelled) {
          setHomeId(home?.id ?? null);
          setAnomalies(nextAnomalies);
          setLiveEvents(nextLiveEvents);
          setMetrics(nextMetrics);
          setSelectedEvent(
            nextAnomalies[0]
              ? { kind: "anomaly", item: nextAnomalies[0] }
              : nextLiveEvents[0]
                ? { kind: "live", item: nextLiveEvents[0] }
                : null,
          );
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

  if (!anomalies.length && !liveEvents.length) {
    return (
      <EmptyState
        message="No anomalies or NILM step events are currently available for the selected workspace."
        title="No detected events"
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
          <h2>Events</h2>
          <p>Review anomaly alerts and live NILM load events with signal context and next actions.</p>
        </div>
        <StatusPill tone="warning">{anomalies.length + liveEvents.length} events</StatusPill>
      </section>

      <section className="anomaly-review-grid">
        <article className="panel anomaly-card anomaly-card--detail">
          <EventDetail selection={selectedEvent} metrics={metrics} />
        </article>

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
                onClick={() => setSelectedEvent({ kind: "anomaly", item: anomaly })}
                type="button"
              >
                <Activity size={16} />
                View details
              </button>
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

        {liveEvents.slice(-8).reverse().map((event) => (
          <article className="panel anomaly-card" key={event.event_id}>
            <div className="panel__heading">
              <div>
                <span className="eyebrow">{formatDateTime(event.ts)}</span>
                <h2>{event.estimated_appliance.replace(/_/g, " ")}</h2>
              </div>
              <StatusPill tone={event.direction === "on" ? "success" : undefined}>
                {event.direction}
              </StatusPill>
            </div>
            <p>{event.explanation}</p>
            <dl className="detected-signal-grid">
              <div>
                <dt>Step magnitude</dt>
                <dd>{Math.round(event.step_magnitude_w).toLocaleString()} W</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatPercent(event.confidence)}</dd>
              </div>
              <div>
                <dt>Before/after</dt>
                <dd>
                  {Math.round(event.before_power_w)} W → {Math.round(event.after_power_w)} W
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{event.source_signal}</dd>
              </div>
            </dl>
            <button
              className="button button--secondary"
              onClick={() => setSelectedEvent({ kind: "live", item: event })}
              type="button"
            >
              <Activity size={16} />
              View details
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

type EventSelection =
  | { kind: "anomaly"; item: AnomalyRead }
  | { kind: "live"; item: LiveNILMEventRead };

function EventDetail({
  metrics,
  selection,
}: {
  metrics: EnergyMetricRead[];
  selection: EventSelection | null;
}) {
  if (!selection) {
    return <EmptyState message="Select an event to inspect its signal context." title="No event selected" />;
  }

  const eventTs = selection.kind === "anomaly" ? selection.item.detected_at : selection.item.ts;
  const windowMetrics = metricsAround(metrics, eventTs, 10);

  return (
    <>
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Event detail</span>
          <h2>{selection.kind === "anomaly" ? selection.item.title : selection.item.estimated_appliance.replace(/_/g, " ")}</h2>
        </div>
        <StatusPill tone={selection.kind === "anomaly" ? "warning" : "success"}>
          {selection.kind === "anomaly" ? selection.item.status : selection.item.direction}
        </StatusPill>
      </div>
      <dl className="detected-signal-grid">
        <div>
          <dt>Timestamp</dt>
          <dd>{formatDateTime(eventTs)}</dd>
        </div>
        <div>
          <dt>Detected step</dt>
          <dd>{selection.kind === "anomaly" ? formatSignalDelta(selection.item) : `${Math.round(selection.item.step_magnitude_w)} W`}</dd>
        </div>
        <div>
          <dt>Likely appliance</dt>
          <dd>{selection.kind === "anomaly" ? likelyCause(selection.item) : selection.item.estimated_appliance.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{selection.kind === "anomaly" ? formatPercent(selection.item.score) : formatPercent(selection.item.confidence)}</dd>
        </div>
      </dl>
      <p>
        {selection.kind === "anomaly"
          ? selection.item.description ?? "This event crossed the anomaly threshold."
          : selection.item.explanation}
      </p>
      <PowerTrendChart
        eventMarkers={selection.kind === "live" ? [selection.item] : []}
        metrics={windowMetrics.length ? windowMetrics : metrics.slice(0, 30)}
        signal="apparent_power_va"
      />
      <div className="profile-notes">
        {(selection.kind === "live"
          ? selection.item.limitations
          : [recommendedAction(selection.item), "Use acknowledge/resolve after reviewing the signal window."]).map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </>
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

function metricsAround(metrics: EnergyMetricRead[], timestamp: string, minutes: number) {
  const eventTime = new Date(timestamp).getTime();
  const radius = minutes * 60 * 1000;
  return metrics.filter((metric) => {
    const metricTime = new Date(metric.ts).getTime();
    return Math.abs(metricTime - eventTime) <= radius;
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

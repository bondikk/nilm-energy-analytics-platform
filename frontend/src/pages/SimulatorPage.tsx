import { Play, RadioTower } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/providers";
import { ErrorState } from "../components/ui/ErrorState";
import { StatusPill } from "../components/ui/StatusPill";
import { apiClient } from "../services/apiClient";
import type { DemoLiveMetricResponse, DemoSeedResponse, DeviceRead, HomeRead } from "../types/api";

export function SimulatorPage() {
  const { token } = useAuth();
  const [sampleCount, setSampleCount] = useState(96);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [selectedScenario, setSelectedScenario] = useState<LiveScenarioId>("kettle");
  const [customPowerW, setCustomPowerW] = useState(980);
  const [seedResult, setSeedResult] = useState<DemoSeedResponse | null>(null);
  const [liveResult, setLiveResult] = useState<DemoLiveMetricResponse | null>(null);
  const [homes, setHomes] = useState<HomeRead[]>([]);
  const [devices, setDevices] = useState<DeviceRead[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      if (!token) {
        return;
      }
      try {
        const nextHomes = await apiClient.homes(token);
        const firstHome = nextHomes[0];
        const nextDevices = firstHome ? await apiClient.devices(token, firstHome.id) : [];
        if (!cancelled) {
          setHomes(nextHomes);
          setDevices(nextDevices);
        }
      } catch {
        if (!cancelled) {
          setHomes([]);
          setDevices([]);
        }
      }
    }
    void loadContext();
    return () => {
      cancelled = true;
    };
  }, [token, seedResult]);

  async function seedWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSeedResult(
        await apiClient.seedDemo({
          sample_count: sampleCount,
          interval_minutes: intervalMinutes,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to seed demo workspace");
    } finally {
      setBusy(false);
    }
  }

  async function publishLiveMetric(scenario: LiveScenarioId) {
    const home = homes[0];
    const device = devices[0];
    if (!home || !device) {
      setError("Create or seed a workspace before publishing live metrics.");
      return;
    }
    const selected = scenarioPayload(scenario, customPowerW);
    setError("");
    try {
      setLiveResult(
        await apiClient.publishLiveMetric(token, {
          home_id: home.id,
          device_id: device.id,
          active_power_w: selected.active_power_w,
          voltage_v: selected.voltage_v,
          power_factor: selected.power_factor,
          interval_minutes: 1,
          scenario,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish live signal");
    }
  }

  const targetHome = homes[0] ?? null;
  const targetDevice = devices[0] ?? null;
  const payloadPreview =
    targetHome && targetDevice
      ? {
          home_id: targetHome.id,
          device_id: targetDevice.id,
          ...scenarioPayload(selectedScenario, customPowerW),
          interval_minutes: 1,
          scenario: selectedScenario,
        }
      : null;

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Developer utility</span>
            <h2>Telemetry Simulator</h2>
            <p>Create a local telemetry workspace or publish appliance-like MQTT events.</p>
          </div>
          <Play size={18} />
        </div>
      </section>

      <div className="model-grid">
        <section className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Mode 1</span>
              <h2>Demo workspace</h2>
              <p>Generate reproducible historical readings for Dashboard, Live NILM, and Events.</p>
            </div>
          </div>
        <form className="form-grid" onSubmit={seedWorkspace}>
          <label>
            Samples
            <input
              min={12}
              max={2000}
              type="number"
              value={sampleCount}
              onChange={(event) => setSampleCount(Number(event.target.value))}
            />
          </label>
          <label>
            Interval minutes
            <input
              min={1}
              max={60}
              type="number"
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(Number(event.target.value))}
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            {busy ? "Generating..." : "Generate demo workspace"}
          </button>
        </form>
        {seedResult ? (
          <div className="success-callout">
            <strong>Demo workspace generated.</strong>
            <span>Open Dashboard to inspect the historical signal and Live NILM estimates.</span>
            <Link className="button button--secondary" to="/dashboard">
              Open Dashboard
            </Link>
          </div>
        ) : null}
        {error ? <ErrorState message={error} /> : null}
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Mode 2</span>
            <h2>Live MQTT test</h2>
            <p>Publish a realistic load event and inspect its NILM estimate on Dashboard or Live NILM.</p>
          </div>
          <RadioTower size={18} />
        </div>
        {targetHome && targetDevice ? (
          <div className="definition-list">
            <div>
              <dt>Target device</dt>
              <dd>
                {targetHome.name} · {targetDevice.name}
              </dd>
            </div>
            <div>
              <dt>External ID</dt>
              <dd>{targetDevice.external_id}</dd>
            </div>
            <div>
              <dt>Target MQTT topic</dt>
              <dd>voltpulse/demo/devices/{targetDevice.external_id}/metrics</dd>
            </div>
          </div>
        ) : null}
        <div className="scenario-grid">
          {LIVE_SCENARIOS.map((scenario) => (
            <button
              className={`scenario-option ${selectedScenario === scenario.id ? "is-selected" : ""}`}
              key={scenario.id}
              type="button"
              onClick={() => setSelectedScenario(scenario.id)}
            >
              <strong>{scenario.label}</strong>
              <span>{scenario.description}</span>
              <small>{formatWatts(scenarioPayload(scenario.id, customPowerW).active_power_w)}</small>
            </button>
          ))}
        </div>
        {selectedScenario === "custom" ? (
          <label className="form-inline-control">
            Custom active power
            <input
              min={0}
              max={5000}
              type="number"
              value={customPowerW}
              onChange={(event) => setCustomPowerW(Number(event.target.value))}
            />
          </label>
        ) : null}
        <button
          className="button"
          disabled={!targetHome || !targetDevice}
          type="button"
          onClick={() => publishLiveMetric(selectedScenario)}
        >
          Publish selected event
        </button>
        {targetHome && targetDevice ? (
          <StatusPill tone="success">Ready to publish</StatusPill>
        ) : (
          <StatusPill tone="warning">No active device</StatusPill>
        )}
        {payloadPreview ? <pre>{JSON.stringify(payloadPreview, null, 2)}</pre> : null}
        {liveResult ? (
          <div className="success-callout">
            <strong>Live reading sent.</strong>
            <span>Topic: {liveResult.topic}</span>
            <Link className="button button--secondary" to="/dashboard">
              Inspect live update
            </Link>
          </div>
        ) : null}
      </section>
      </div>
    </div>
  );
}

type LiveScenarioId = "normal" | "kettle" | "fridge" | "spike" | "custom";

const LIVE_SCENARIOS: Array<{
  id: LiveScenarioId;
  label: string;
  description: string;
}> = [
  {
    id: "normal",
    label: "Normal load",
    description: "Small steady household baseline.",
  },
  {
    id: "kettle",
    label: "Kettle event",
    description: "Large resistive step for live disaggregation.",
  },
  {
    id: "fridge",
    label: "Fridge cycle",
    description: "Small compressor-like load edge.",
  },
  {
    id: "spike",
    label: "Power spike",
    description: "High load event useful for event detection.",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manual active-power payload.",
  },
];

function scenarioPayload(scenario: LiveScenarioId, customPowerW: number) {
  const payloads: Record<LiveScenarioId, { active_power_w: number; voltage_v: number; power_factor: number }> = {
    normal: { active_power_w: 430, voltage_v: 230, power_factor: 0.9 },
    kettle: { active_power_w: 2260, voltage_v: 230, power_factor: 0.98 },
    fridge: { active_power_w: 165, voltage_v: 230, power_factor: 0.82 },
    spike: { active_power_w: 3100, voltage_v: 230, power_factor: 0.97 },
    custom: { active_power_w: customPowerW, voltage_v: 230, power_factor: 0.92 },
  };
  return payloads[scenario];
}

function formatWatts(value: number) {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(2)} kW`;
  }
  return `${Math.round(value)} W`;
}

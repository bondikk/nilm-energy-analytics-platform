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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sampleCount, setSampleCount] = useState(96);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
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
          email,
          password,
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

  async function publishLiveMetric(scenario: string) {
    const home = homes[0];
    const device = devices[0];
    if (!home || !device) {
      setError("Create or seed a workspace before publishing live metrics.");
      return;
    }
    setError("");
    setLiveResult(
      await apiClient.publishLiveMetric(token, {
        home_id: home.id,
        device_id: device.id,
        active_power_w: scenario === "spike" ? 2400 : 620,
        voltage_v: 230,
        power_factor: scenario === "spike" ? 0.97 : 0.91,
        interval_minutes: 1,
        scenario,
      }),
    );
  }

  const targetHome = homes[0] ?? null;
  const targetDevice = devices[0] ?? null;
  const payloadPreview =
    targetHome && targetDevice
      ? {
          home_id: targetHome.id,
          device_id: targetDevice.id,
          active_power_w: 620,
          voltage_v: 230,
          power_factor: 0.91,
          interval_minutes: 1,
          scenario: "normal",
        }
      : null;

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Developer utility</span>
            <h2>Telemetry Simulator</h2>
            <p>Generate demo data or send a live MQTT reading through the real ingestion path.</p>
          </div>
          <Play size={18} />
        </div>
      </section>

      <div className="model-grid">
        <section className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Mode 1</span>
              <h2>Seed demo workspace</h2>
              <p>Generate reproducible historical readings for Dashboard, Live NILM, and Anomalies.</p>
            </div>
          </div>
        <form className="form-grid" onSubmit={seedWorkspace}>
          <label>
            Email
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input
              minLength={8}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
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
            {busy ? "Generating..." : "Generate demo dataset"}
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
            <h2>Send live signal</h2>
            <p>Publish a normal or spike reading so Dashboard updates through MQTT and Redis.</p>
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
          </div>
        ) : null}
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => publishLiveMetric("normal")}>
            Normal load
          </button>
          <button className="button" type="button" onClick={() => publishLiveMetric("spike")}>
            Spike load
          </button>
        </div>
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

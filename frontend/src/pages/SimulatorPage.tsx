import { Play, RadioTower } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

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

  return (
    <div className="model-grid">
      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Demo seed</span>
            <h2>Create a reproducible workspace</h2>
          </div>
          <Play size={18} />
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
            {busy ? "Seeding..." : "Seed workspace"}
          </button>
        </form>
        {seedResult ? (
          <pre>{JSON.stringify({ ...seedResult, password: "hidden" }, null, 2)}</pre>
        ) : null}
        {error ? <ErrorState message={error} /> : null}
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Live MQTT path</span>
            <h2>Publish simulated metric</h2>
          </div>
          <RadioTower size={18} />
        </div>
        <p className="muted">
          Sends a metric through the backend demo publisher so the existing ingestion pipeline can
          process it.
        </p>
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={() => publishLiveMetric("normal")}>
            Normal load
          </button>
          <button className="button" type="button" onClick={() => publishLiveMetric("spike")}>
            Spike load
          </button>
        </div>
        {homes[0] && devices[0] ? (
          <StatusPill tone="success">
            {homes[0].name} · {devices[0].name}
          </StatusPill>
        ) : (
          <StatusPill tone="warning">No active device</StatusPill>
        )}
        {liveResult ? <pre>{JSON.stringify(liveResult, null, 2)}</pre> : null}
      </section>
    </div>
  );
}

import type { AnomalyRead, EnergyMetricRead } from "../../types/api";

export interface LiveApplianceEstimate {
  id: string;
  label: string;
  estimatedPowerW: number;
  confidence: number;
  state: "active" | "possible" | "idle";
  reason: string;
}

export interface LiveNilmState {
  currentPowerW: number;
  apparentPowerVa: number;
  voltageV: number;
  currentA: number;
  baseLoadW: number;
  stepDeltaW: number;
  activeAppliances: LiveApplianceEstimate[];
  latestAnomaly: AnomalyRead | null;
}

const APPLIANCE_SIGNATURES = [
  { id: "kettle", label: "Kettle", minW: 1600, maxW: 2600, nominalW: 2200 },
  { id: "microwave", label: "Microwave", minW: 700, maxW: 1400, nominalW: 1000 },
  { id: "dishwasher", label: "Dishwasher", minW: 650, maxW: 1400, nominalW: 900 },
  { id: "washing_machine", label: "Washing machine", minW: 350, maxW: 900, nominalW: 520 },
  { id: "fridge", label: "Fridge", minW: 70, maxW: 190, nominalW: 120 },
] as const;

export function buildLiveNilmState(
  metrics: EnergyMetricRead[],
  anomalies: AnomalyRead[] = [],
): LiveNilmState {
  const ordered = metrics.slice().sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));
  const latest = ordered[0] ?? null;
  const previous = ordered[1] ?? null;
  const recentPower = ordered
    .slice(0, 96)
    .map(metricPower)
    .filter((value) => value > 0);
  const currentPowerW = latest ? metricPower(latest) : 0;
  const previousPowerW = previous ? metricPower(previous) : currentPowerW;
  const baseLoadW = recentPower.length ? Math.min(...recentPower) : 0;
  const stepDeltaW = currentPowerW - previousPowerW;

  return {
    currentPowerW,
    apparentPowerVa: latest?.apparent_power_va ?? 0,
    voltageV: latest?.voltage_v ?? 0,
    currentA: latest?.current_a ?? 0,
    baseLoadW,
    stepDeltaW,
    activeAppliances: estimateAppliances(currentPowerW, baseLoadW, stepDeltaW),
    latestAnomaly: anomalies[0] ?? null,
  };
}

function estimateAppliances(
  currentPowerW: number,
  baseLoadW: number,
  stepDeltaW: number,
): LiveApplianceEstimate[] {
  const availableLoadW = Math.max(0, currentPowerW - baseLoadW);
  const signalW = Math.abs(stepDeltaW) >= 60 ? Math.abs(stepDeltaW) : availableLoadW;

  return APPLIANCE_SIGNATURES.map((signature) => {
    const distance = Math.abs(signalW - signature.nominalW);
    const tolerance = Math.max(80, (signature.maxW - signature.minW) / 2);
    const confidence = Math.max(0, Math.min(0.96, 1 - distance / (tolerance * 1.8)));
    const isInRange = signalW >= signature.minW && signalW <= signature.maxW;
    const state: LiveApplianceEstimate["state"] =
      isInRange && confidence >= 0.45 ? "active" : confidence >= 0.22 ? "possible" : "idle";
    return {
      id: signature.id,
      label: signature.label,
      estimatedPowerW: isInRange ? Math.round(signalW) : signature.nominalW,
      confidence: Number(confidence.toFixed(2)),
      state,
      reason: isInRange
        ? `Recent step/load matches ${signature.minW}-${signature.maxW} W signature.`
        : `Waiting for a ${signature.minW}-${signature.maxW} W signature.`,
    };
  }).sort((left, right) => right.confidence - left.confidence);
}

function metricPower(metric: EnergyMetricRead) {
  return metric.active_power_w ?? metric.apparent_power_va ?? 0;
}

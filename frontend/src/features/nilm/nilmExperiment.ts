import type { NILMLabDemoRead, NILMLabPointRead } from "../../types/api";

export interface NilmOverlayVisibility {
  aggregate: boolean;
  actual: boolean;
  predicted: boolean;
  error: boolean;
}

export interface NilmChartPoint {
  ts: string;
  label: string;
  aggregate: number;
  actual: number;
  predicted: number;
  absoluteError: number;
}

export interface NilmExperimentSummary {
  activeGroundTruthSamples: number;
  activePredictionSamples: number;
  maxAbsoluteErrorW: number;
  meanAbsoluteErrorW: number;
  actualEnergyWh: number;
  predictedEnergyWh: number;
  energyErrorWh: number;
}

export const DEFAULT_NILM_OVERLAY_VISIBILITY: NilmOverlayVisibility = {
  aggregate: true,
  actual: true,
  predicted: true,
  error: true,
};

export function buildNilmChartPoints(points: NILMLabPointRead[]): NilmChartPoint[] {
  return points.map((point) => ({
    ts: point.ts,
    label: new Date(point.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    aggregate: point.aggregate_power_w,
    actual: point.actual_power_w,
    predicted: point.predicted_power_w,
    absoluteError: Math.abs(point.predicted_power_w - point.actual_power_w),
  }));
}

export function summarizeNilmExperiment(demo: NILMLabDemoRead): NilmExperimentSummary {
  const sampleHours = demo.sample_period_seconds / 3600;
  const activeGroundTruthSamples = demo.points.filter(
    (point) => point.actual_power_w >= demo.on_threshold_w,
  ).length;
  const activePredictionSamples = demo.points.filter(
    (point) => point.predicted_power_w >= demo.on_threshold_w,
  ).length;
  const errors = demo.points.map((point) => Math.abs(point.predicted_power_w - point.actual_power_w));
  const actualEnergyWh = demo.points.reduce(
    (total, point) => total + point.actual_power_w * sampleHours,
    0,
  );
  const predictedEnergyWh = demo.points.reduce(
    (total, point) => total + point.predicted_power_w * sampleHours,
    0,
  );

  return {
    activeGroundTruthSamples,
    activePredictionSamples,
    maxAbsoluteErrorW: Math.max(...errors, 0),
    meanAbsoluteErrorW:
      errors.length > 0 ? errors.reduce((total, value) => total + value, 0) / errors.length : 0,
    actualEnergyWh,
    predictedEnergyWh,
    energyErrorWh: predictedEnergyWh - actualEnergyWh,
  };
}

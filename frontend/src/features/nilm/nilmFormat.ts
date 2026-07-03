export function formatMetric(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

export function formatWatts(value: number) {
  return `${Math.round(value).toLocaleString()} W`;
}

import { API_BASE_URL } from "./apiClient";
import type { RealtimeMetricEvent } from "../types/api";

export function buildMetricsSocketUrl(token: string) {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/metrics/live";
  url.searchParams.set("token", token);
  return url.toString();
}

export function connectMetricsSocket(
  token: string,
  handlers: {
    onMetric: (event: RealtimeMetricEvent) => void;
    onStatus?: (status: "connecting" | "online" | "offline") => void;
  },
) {
  handlers.onStatus?.("connecting");
  const socket = new WebSocket(buildMetricsSocketUrl(token));

  socket.addEventListener("open", () => handlers.onStatus?.("online"));
  socket.addEventListener("close", () => handlers.onStatus?.("offline"));
  socket.addEventListener("error", () => handlers.onStatus?.("offline"));
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data) as RealtimeMetricEvent;
    if (payload.event === "metric_created") {
      handlers.onMetric(payload);
    }
  });

  return socket;
}

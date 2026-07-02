const API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_EMAIL = "demo@voltpulse.local";
const DEFAULT_PASSWORD = "demo-password";

const state = {
  token: localStorage.getItem("voltpulse_token") || "",
  user: null,
  activeView: localStorage.getItem("voltpulse_view") || "overview",
  homes: [],
  devices: [],
  metrics: [],
  anomalies: [],
  summary: null,
  selectedHomeId: localStorage.getItem("voltpulse_home_id") || "",
  selectedDeviceId: localStorage.getItem("voltpulse_device_id") || "",
  period: localStorage.getItem("voltpulse_period") || "24h",
  autoRefresh: localStorage.getItem("voltpulse_auto_refresh") === "true",
  autoRefreshTimer: null,
};

const elements = {
  navItems: [...document.querySelectorAll("[data-view]")],
  views: [...document.querySelectorAll("[data-view-panel]")],
  viewTitle: document.querySelector("#view-title"),
  loginForm: document.querySelector("#login-form"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  sessionLabel: document.querySelector("#session-label"),
  sessionEmail: document.querySelector("#session-email"),
  signOutButton: document.querySelector("#sign-out-button"),
  refreshButton: document.querySelector("#refresh-button"),
  exportButton: document.querySelector("#export-button"),
  homeSelect: document.querySelector("#home-select"),
  deviceSelect: document.querySelector("#device-select"),
  periodSelect: document.querySelector("#period-select"),
  autoRefreshToggle: document.querySelector("#auto-refresh-toggle"),
  message: document.querySelector("#message"),
  sampleCount: document.querySelector("#sample-count"),
  energyTotal: document.querySelector("#energy-total"),
  energyContext: document.querySelector("#energy-context"),
  avgPower: document.querySelector("#avg-power"),
  peakPower: document.querySelector("#peak-power"),
  powerRange: document.querySelector("#power-range"),
  avgVoltage: document.querySelector("#avg-voltage"),
  avgCurrent: document.querySelector("#avg-current"),
  chartSubtitle: document.querySelector("#chart-subtitle"),
  lastRefresh: document.querySelector("#last-refresh"),
  powerChart: document.querySelector("#power-chart"),
  analyticsChart: document.querySelector("#analytics-chart"),
  operationsList: document.querySelector("#operations-list"),
  homeForm: document.querySelector("#home-form"),
  homeName: document.querySelector("#home-name"),
  homeTimezone: document.querySelector("#home-timezone"),
  homeLocation: document.querySelector("#home-location"),
  homesCount: document.querySelector("#homes-count"),
  homesTable: document.querySelector("#homes-table"),
  deviceForm: document.querySelector("#device-form"),
  deviceExternalId: document.querySelector("#device-external-id"),
  deviceName: document.querySelector("#device-name"),
  deviceType: document.querySelector("#device-type"),
  deviceFirmware: document.querySelector("#device-firmware"),
  devicesCount: document.querySelector("#devices-count"),
  devicesTable: document.querySelector("#devices-table"),
  analyticsSubtitle: document.querySelector("#analytics-subtitle"),
  analyticsTotal: document.querySelector("#analytics-total"),
  readingsCount: document.querySelector("#readings-count"),
  readingsTable: document.querySelector("#readings-table"),
  anomalyStatusFilter: document.querySelector("#anomaly-status-filter"),
  anomalySeverityFilter: document.querySelector("#anomaly-severity-filter"),
  anomalyCount: document.querySelector("#anomaly-count"),
  anomalyList: document.querySelector("#anomaly-list"),
  seedForm: document.querySelector("#seed-form"),
  seedEmail: document.querySelector("#seed-email"),
  seedPassword: document.querySelector("#seed-password"),
  seedSampleCount: document.querySelector("#seed-sample-count"),
  seedInterval: document.querySelector("#seed-interval"),
  seedResultTitle: document.querySelector("#seed-result-title"),
  seedResult: document.querySelector("#seed-result"),
  settingsApi: document.querySelector("#settings-api"),
  settingsSession: document.querySelector("#settings-session"),
  settingsRefresh: document.querySelector("#settings-refresh"),
};

const viewLabels = {
  overview: "Overview",
  homes: "Homes",
  devices: "Devices",
  analytics: "Analytics",
  anomalies: "Anomalies",
  simulator: "Simulator",
  settings: "Settings",
};

elements.email.value = DEFAULT_EMAIL;
elements.password.value = DEFAULT_PASSWORD;
elements.periodSelect.value = state.period;
elements.autoRefreshToggle.checked = state.autoRefresh;

elements.navItems.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn(elements.email.value, elements.password.value);
});

elements.signOutButton.addEventListener("click", () => {
  state.token = "";
  state.user = null;
  localStorage.removeItem("voltpulse_token");
  updateSession();
  clearWorkspace();
});

elements.refreshButton.addEventListener("click", () => {
  refreshDashboard().catch(showError);
});

elements.exportButton.addEventListener("click", () => {
  exportMetricsCsv();
});

elements.homeSelect.addEventListener("change", async () => {
  state.selectedHomeId = elements.homeSelect.value;
  state.selectedDeviceId = "";
  persistSelections();
  await loadDevices();
  await loadSelectedData();
});

elements.deviceSelect.addEventListener("change", async () => {
  state.selectedDeviceId = elements.deviceSelect.value;
  persistSelections();
  await loadSelectedData();
});

elements.periodSelect.addEventListener("change", async () => {
  state.period = elements.periodSelect.value;
  localStorage.setItem("voltpulse_period", state.period);
  await loadSelectedData();
});

elements.autoRefreshToggle.addEventListener("change", () => {
  state.autoRefresh = elements.autoRefreshToggle.checked;
  localStorage.setItem("voltpulse_auto_refresh", String(state.autoRefresh));
  configureAutoRefresh();
  renderSettings();
});

elements.homeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createHome();
});

elements.deviceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createDevice();
});

elements.anomalyStatusFilter.addEventListener("change", () => {
  loadAnomalies().catch(showError);
});

elements.anomalySeverityFilter.addEventListener("change", () => {
  loadAnomalies().catch(showError);
});

elements.anomalyList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-anomaly-action]");
  if (!button) {
    return;
  }
  await updateAnomalyStatus(button.dataset.anomalyId, button.dataset.anomalyAction);
});

elements.seedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await seedDemoData();
});

setActiveView(state.activeView);
updateSession();
clearWorkspace();
configureAutoRefresh();
if (state.token) {
  refreshDashboard().catch(showError);
}

async function signIn(email, password) {
  setBusy(true);
  try {
    const response = await fetchJson("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    state.token = response.access_token;
    localStorage.setItem("voltpulse_token", state.token);
    await refreshDashboard();
    hideMessage();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function refreshDashboard() {
  if (!state.token) {
    clearWorkspace();
    showMessage("Sign in or seed demo data to load the workspace.");
    return;
  }

  setBusy(true);
  try {
    state.user = await fetchJson("/users/me");
    updateSession();
    state.homes = await fetchJson("/homes");
    ensureSelectedHome();
    renderHomes();
    renderHomeOptions();
    await loadDevices();
    await loadSelectedData();
    renderSettings();
    hideMessage();
  } catch (error) {
    if (String(error.message || error).startsWith("401")) {
      state.token = "";
      localStorage.removeItem("voltpulse_token");
      updateSession();
      clearWorkspace();
    }
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function loadDevices() {
  state.devices = [];
  state.selectedDeviceId = "";
  elements.deviceSelect.innerHTML = "";

  if (!state.selectedHomeId) {
    renderDevices();
    return;
  }

  state.devices = await fetchJson(`/homes/${state.selectedHomeId}/devices`);
  ensureSelectedDevice();
  renderDeviceOptions();
  renderDevices();
}

async function loadSelectedData() {
  if (!state.selectedHomeId) {
    clearDataSurfaces();
    return;
  }

  const periodQuery = buildPeriodQuery();
  const deviceQuery = state.selectedDeviceId ? `device_id=${state.selectedDeviceId}` : "";
  const summaryQuery = [periodQuery, deviceQuery].filter(Boolean).join("&");
  const metricsQuery = [periodQuery, "limit=1000"].filter(Boolean).join("&");

  const summaryPath = `/homes/${state.selectedHomeId}/analytics/summary${
    summaryQuery ? `?${summaryQuery}` : ""
  }`;
  const metricsPath = state.selectedDeviceId
    ? `/homes/${state.selectedHomeId}/devices/${state.selectedDeviceId}/metrics${
        metricsQuery ? `?${metricsQuery}` : ""
      }`
    : "";

  const [summary, metrics] = await Promise.all([
    fetchJson(summaryPath),
    metricsPath ? fetchJson(metricsPath) : Promise.resolve([]),
    loadAnomalies(),
  ]);

  state.summary = summary;
  state.metrics = metrics;
  renderSummary();
  renderCharts();
  renderReadings();
  renderOperations();
  renderSettings();
}

async function loadAnomalies() {
  if (!state.selectedHomeId) {
    state.anomalies = [];
    renderAnomalies();
    return;
  }

  const query = new URLSearchParams({ limit: "100" });
  if (elements.anomalyStatusFilter.value) {
    query.set("status", elements.anomalyStatusFilter.value);
  }
  if (elements.anomalySeverityFilter.value) {
    query.set("severity", elements.anomalySeverityFilter.value);
  }

  state.anomalies = await fetchJson(`/homes/${state.selectedHomeId}/anomalies?${query}`);
  renderAnomalies();
}

async function createHome() {
  if (!state.token) {
    showMessage("Sign in before creating a home.");
    return;
  }

  setBusy(true);
  try {
    const home = await fetchJson("/homes", {
      method: "POST",
      body: {
        name: elements.homeName.value,
        timezone: elements.homeTimezone.value,
        location_label: elements.homeLocation.value || null,
      },
    });
    state.selectedHomeId = home.id;
    elements.homeForm.reset();
    elements.homeTimezone.value = "Europe/Bratislava";
    await refreshDashboard();
    showMessage(`Created home ${home.name}.`);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function createDevice() {
  if (!state.selectedHomeId) {
    showMessage("Select a home before creating a device.");
    return;
  }

  setBusy(true);
  try {
    const device = await fetchJson(`/homes/${state.selectedHomeId}/devices`, {
      method: "POST",
      body: {
        external_id: elements.deviceExternalId.value,
        name: elements.deviceName.value,
        device_type: elements.deviceType.value,
        firmware_version: elements.deviceFirmware.value || null,
      },
    });
    state.selectedDeviceId = device.id;
    elements.deviceForm.reset();
    await loadDevices();
    await loadSelectedData();
    showMessage(`Created device ${device.name}.`);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function updateAnomalyStatus(anomalyId, status) {
  if (!state.selectedHomeId || !anomalyId || !status) {
    return;
  }

  setBusy(true);
  try {
    const body = { status };
    if (status === "resolved") {
      body.resolved_at = new Date().toISOString();
    }
    await fetchJson(`/homes/${state.selectedHomeId}/anomalies/${anomalyId}`, {
      method: "PATCH",
      body,
    });
    await loadAnomalies();
    showMessage(`Anomaly marked ${status}.`);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function seedDemoData() {
  setBusy(true);
  try {
    const result = await fetchJson("/demo/seed", {
      method: "POST",
      skipAuth: true,
      body: {
        email: elements.seedEmail.value,
        password: elements.seedPassword.value,
        sample_count: Number(elements.seedSampleCount.value),
        interval_minutes: Number(elements.seedInterval.value),
      },
    });
    renderSeedResult(result);
    elements.email.value = result.email;
    elements.password.value = result.password;
    await signIn(result.email, result.password);
    showMessage(`Seeded ${result.metric_count} readings and ${result.anomaly_count} anomaly.`);
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function setActiveView(view) {
  state.activeView = viewLabels[view] ? view : "overview";
  localStorage.setItem("voltpulse_view", state.activeView);

  elements.navItems.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  elements.views.forEach((viewPanel) => {
    viewPanel.classList.toggle("active", viewPanel.dataset.viewPanel === state.activeView);
  });
  elements.viewTitle.textContent = viewLabels[state.activeView];
  renderSettings();
}

function renderHomeOptions() {
  elements.homeSelect.innerHTML = "";
  if (state.homes.length === 0) {
    appendOption(elements.homeSelect, "", "No homes");
    return;
  }

  for (const home of state.homes) {
    appendOption(elements.homeSelect, home.id, home.name);
  }
  elements.homeSelect.value = state.selectedHomeId;
}

function renderDeviceOptions() {
  elements.deviceSelect.innerHTML = "";
  if (state.devices.length === 0) {
    appendOption(elements.deviceSelect, "", "No devices");
    return;
  }

  for (const device of state.devices) {
    appendOption(elements.deviceSelect, device.id, `${device.name} (${device.external_id})`);
  }
  elements.deviceSelect.value = state.selectedDeviceId;
}

function renderHomes() {
  elements.homesCount.textContent = `${state.homes.length} total`;
  elements.homesTable.innerHTML = "";
  for (const home of state.homes) {
    const row = createTableRow([
      home.name,
      home.timezone,
      home.location_label || "Not set",
      formatDate(home.created_at),
    ]);
    elements.homesTable.append(row);
  }
  if (state.homes.length === 0) {
    elements.homesTable.append(createEmptyTableRow("No homes", 4));
  }
}

function renderDevices() {
  elements.devicesCount.textContent = `${state.devices.length} total`;
  elements.devicesTable.innerHTML = "";
  for (const device of state.devices) {
    const row = createTableRow([
      device.name,
      device.external_id,
      titleCase(device.device_type),
      titleCase(device.status),
      device.firmware_version || "Not set",
    ]);
    elements.devicesTable.append(row);
  }
  if (state.devices.length === 0) {
    elements.devicesTable.append(createEmptyTableRow("No devices", 5));
  }
}

function renderSummary() {
  const summary = state.summary || {};
  elements.sampleCount.textContent = `${formatNumber(summary.sample_count || 0)} samples`;
  elements.energyTotal.textContent = formatEnergy(summary.energy_wh_delta_total);
  elements.energyContext.textContent = labelForPeriod();
  elements.avgPower.textContent = formatWatts(summary.active_power_w_avg);
  elements.peakPower.textContent = formatWatts(summary.active_power_w_max);
  elements.powerRange.textContent = `${formatWatts(summary.active_power_w_min)} min`;
  elements.avgVoltage.textContent = formatVolts(summary.voltage_v_avg);
  elements.avgCurrent.textContent = `${formatAmps(summary.current_a_avg)} avg current`;
  elements.analyticsTotal.textContent = formatEnergy(summary.energy_wh_delta_total);
  elements.lastRefresh.textContent = `Updated ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function renderCharts() {
  renderPowerChart(elements.powerChart, state.metrics, "overview");
  renderPowerChart(elements.analyticsChart, state.metrics, "analytics");

  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  const subtitle = selectedDevice
    ? `${selectedDevice.name} · ${state.metrics.length} samples`
    : "No device selected";
  elements.chartSubtitle.textContent = subtitle;
  elements.analyticsSubtitle.textContent = `${subtitle} · ${labelForPeriod()}`;
}

function renderPowerChart(canvas, metrics, mode) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawChartGrid(context, width, height);

  const ordered = [...metrics].reverse();
  const values = ordered
    .map((metric) => metric.active_power_w)
    .filter((value) => typeof value === "number");

  if (values.length === 0) {
    drawEmptyChart(context, width, height);
    return;
  }

  const padding = mode === "analytics" ? 44 : 34;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const spread = Math.max(maxValue - minValue, 1);
  const points = values.map((value, index) => ({
    x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((value - minValue) / spread) * (height - padding * 2),
    value,
  }));

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.lineWidth = mode === "analytics" ? 4 : 3;
  context.strokeStyle = "#1967d2";
  context.stroke();

  context.lineTo(points[points.length - 1].x, height - padding);
  context.lineTo(points[0].x, height - padding);
  context.closePath();
  context.fillStyle = "rgba(25, 103, 210, 0.12)";
  context.fill();

  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  context.fillStyle = "#f2b705";
  context.beginPath();
  context.arc(peak.x, peak.y, 5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#5f6f7f";
  context.font = "14px system-ui";
  context.textAlign = "left";
  context.fillText(`${Math.round(maxValue)} W peak`, padding, 24);
  context.fillText(`${Math.round(minValue)} W min`, padding, height - 12);
}

function drawChartGrid(context, width, height) {
  context.strokeStyle = "#e4ebf1";
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const y = (height / 5) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawEmptyChart(context, width, height) {
  context.fillStyle = "#65717e";
  context.font = "18px system-ui";
  context.textAlign = "center";
  context.fillText("No metric samples", width / 2, height / 2);
}

function renderReadings() {
  elements.readingsCount.textContent = `${state.metrics.length} rows`;
  elements.readingsTable.innerHTML = "";
  for (const metric of state.metrics.slice(0, 80)) {
    elements.readingsTable.append(
      createTableRow([
        formatDate(metric.ts),
        formatWatts(metric.active_power_w),
        formatVolts(metric.voltage_v),
        formatAmps(metric.current_a),
        `${formatNumber(metric.energy_wh_delta || 0)} Wh`,
      ])
    );
  }
  if (state.metrics.length === 0) {
    elements.readingsTable.append(createEmptyTableRow("No readings", 5));
  }
}

function renderAnomalies() {
  elements.anomalyCount.textContent = `${state.anomalies.length} items`;
  elements.anomalyList.innerHTML = "";

  if (state.anomalies.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No anomalies";
    elements.anomalyList.append(empty);
    return;
  }

  for (const anomaly of state.anomalies) {
    const item = document.createElement("article");
    item.className = "anomaly-item";

    const header = document.createElement("div");
    header.className = "anomaly-row";

    const title = document.createElement("span");
    title.className = "anomaly-title";
    title.textContent = anomaly.title;

    const severity = document.createElement("span");
    severity.className = `pill ${anomaly.severity}`;
    severity.textContent = anomaly.severity;

    header.append(title, severity);

    const meta = document.createElement("div");
    meta.className = "anomaly-meta";
    meta.textContent = `${titleCase(anomaly.status)} · ${titleCase(
      anomaly.anomaly_type
    )} · ${formatDate(anomaly.detected_at)}`;

    const description = document.createElement("p");
    description.textContent = anomaly.description || "No description";

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(
      createAnomalyButton(anomaly.id, "acknowledged", "Acknowledge", anomaly.status !== "open"),
      createAnomalyButton(anomaly.id, "resolved", "Resolve", anomaly.status === "resolved")
    );

    item.append(header, meta, description, actions);
    elements.anomalyList.append(item);
  }
}

function renderOperations() {
  elements.operationsList.innerHTML = "";

  const openAnomalies = state.anomalies.filter((anomaly) => anomaly.status === "open").length;
  const criticalAnomalies = state.anomalies.filter((anomaly) => anomaly.severity === "critical").length;
  const deviceCount = state.devices.length;
  const latestMetric = state.metrics[0];

  const items = [
    {
      label: "Open anomalies",
      value: String(openAnomalies),
      tone: openAnomalies > 0 ? "warn" : "good",
    },
    {
      label: "Critical anomalies",
      value: String(criticalAnomalies),
      tone: criticalAnomalies > 0 ? "bad" : "good",
    },
    {
      label: "Active devices",
      value: String(deviceCount),
      tone: deviceCount > 0 ? "good" : "muted",
    },
    {
      label: "Latest reading",
      value: latestMetric ? formatDate(latestMetric.ts) : "No readings",
      tone: latestMetric ? "muted" : "warn",
    },
  ];

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "operation-item";
    row.innerHTML = `<span></span><strong></strong>`;
    row.querySelector("span").textContent = item.label;
    row.querySelector("strong").textContent = item.value;
    row.dataset.tone = item.tone;
    elements.operationsList.append(row);
  }
}

function renderSeedResult(result) {
  elements.seedResultTitle.textContent = `${result.metric_count} readings created`;
  elements.seedResult.innerHTML = "";
  const rows = [
    ["Email", result.email],
    ["Password", result.password],
    ["Home ID", result.home_id],
    ["Device ID", result.device_id],
    ["Metrics", result.metric_count],
    ["Anomalies", result.anomaly_count],
  ];
  for (const [label, value] of rows) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    elements.seedResult.append(wrapper);
  }
}

function renderSettings() {
  elements.settingsApi.textContent = API_BASE_URL;
  elements.settingsSession.textContent = state.user ? state.user.email : "Not signed in";
  elements.settingsRefresh.textContent = state.autoRefresh ? "Every 60 seconds" : "Manual";
}

function clearWorkspace() {
  state.homes = [];
  state.devices = [];
  state.metrics = [];
  state.anomalies = [];
  state.summary = null;
  state.selectedHomeId = "";
  state.selectedDeviceId = "";
  renderHomeOptions();
  renderDeviceOptions();
  renderHomes();
  renderDevices();
  clearDataSurfaces();
  renderSettings();
}

function clearDataSurfaces() {
  renderSummary();
  renderCharts();
  renderReadings();
  renderAnomalies();
  renderOperations();
}

function updateSession() {
  const signedIn = Boolean(state.token);
  elements.sessionLabel.textContent = signedIn ? "Signed in" : "Not signed in";
  elements.sessionEmail.textContent = state.user?.email || elements.email.value || DEFAULT_EMAIL;
  elements.loginForm.hidden = signedIn;
  elements.signOutButton.hidden = !signedIn;
}

function configureAutoRefresh() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
  if (state.autoRefresh) {
    state.autoRefreshTimer = setInterval(() => {
      refreshDashboard().catch(showError);
    }, 60_000);
  }
}

function exportMetricsCsv() {
  if (state.metrics.length === 0) {
    showMessage("No metrics to export.");
    return;
  }

  const headers = [
    "ts",
    "active_power_w",
    "voltage_v",
    "current_a",
    "power_factor",
    "energy_wh_delta",
  ];
  const rows = state.metrics.map((metric) =>
    headers.map((key) => JSON.stringify(metric[key] ?? "")).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `voltpulse-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchJson(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token && !options.skipAuth) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      detail = response.statusText;
    }
    throw new Error(`${response.status}: ${detail}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function ensureSelectedHome() {
  if (!state.selectedHomeId || !state.homes.some((home) => home.id === state.selectedHomeId)) {
    state.selectedHomeId = state.homes[0]?.id || "";
  }
  persistSelections();
}

function ensureSelectedDevice() {
  if (
    !state.selectedDeviceId ||
    !state.devices.some((device) => device.id === state.selectedDeviceId)
  ) {
    state.selectedDeviceId = state.devices[0]?.id || "";
  }
  persistSelections();
}

function persistSelections() {
  localStorage.setItem("voltpulse_home_id", state.selectedHomeId);
  localStorage.setItem("voltpulse_device_id", state.selectedDeviceId);
}

function buildPeriodQuery() {
  const range = getPeriodRange();
  if (!range.start) {
    return "";
  }

  const query = new URLSearchParams({
    start: range.start.toISOString(),
  });
  if (range.end) {
    query.set("end", range.end.toISOString());
  }

  return query.toString();
}

function getPeriodRange() {
  if (state.period === "all") {
    return { start: null, end: null };
  }

  const hours = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  }[state.period];

  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start, end };
}

function labelForPeriod() {
  return {
    "24h": "Last 24h",
    "7d": "Last 7d",
    "30d": "Last 30d",
    all: "All data",
  }[state.period];
}

function setBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
  [
    elements.refreshButton,
    elements.exportButton,
    elements.loginForm.querySelector("button"),
    elements.homeForm.querySelector("button"),
    elements.deviceForm.querySelector("button"),
    elements.seedForm.querySelector("button"),
  ].forEach((button) => {
    button.disabled = isBusy;
  });
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.hidden = false;
}

function hideMessage() {
  elements.message.hidden = true;
}

function showError(error) {
  showMessage(error instanceof Error ? error.message : String(error));
}

function appendOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function createTableRow(values) {
  const row = document.createElement("tr");
  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  return row;
}

function createEmptyTableRow(label, colspan) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.className = "empty-cell";
  cell.textContent = label;
  row.append(cell);
  return row;
}

function createAnomalyButton(anomalyId, action, label, disabled) {
  const button = document.createElement("button");
  button.className = "compact-button";
  button.type = "button";
  button.textContent = label;
  button.dataset.anomalyId = anomalyId;
  button.dataset.anomalyAction = action;
  button.disabled = disabled;
  return button;
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatWatts(value) {
  if (value === null || value === undefined) {
    return "0 W";
  }
  return `${Math.round(value).toLocaleString("en-US")} W`;
}

function formatVolts(value) {
  if (value === null || value === undefined) {
    return "0 V";
  }
  return `${Number(value).toFixed(1)} V`;
}

function formatAmps(value) {
  if (value === null || value === undefined) {
    return "0 A";
  }
  return `${Number(value).toFixed(2)} A`;
}

function formatEnergy(value) {
  if (!value) {
    return "0 kWh";
  }
  return `${(value / 1000).toFixed(2)} kWh`;
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

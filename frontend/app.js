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
  metricSocket: null,
  metricSocketReconnectTimer: null,
  metricSocketDesired: false,
  liveStatus: "offline",
  chartMode: localStorage.getItem("voltpulse_chart_mode") || "power",
  compareMode: localStorage.getItem("voltpulse_compare_mode") || "today",
  chartHoverIndex: null,
  overviewChart: null,
  selectedActivityId: localStorage.getItem("voltpulse_activity_id") || "fridge",
  plannerMode: localStorage.getItem("voltpulse_planner_mode") || "balanced",
  shiftHours: Number(localStorage.getItem("voltpulse_shift_hours") || 2),
  nilmDataset: localStorage.getItem("voltpulse_nilm_dataset") || "uk-dale",
  nilmHouse: localStorage.getItem("voltpulse_nilm_house") || "house-1",
  nilmAppliance: localStorage.getItem("voltpulse_nilm_appliance") || "kettle",
  nilmLabData: null,
};

const NILM_LAB_SAMPLE = [
  { time: "12:00", aggregate: 150, fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "12:08", aggregate: 152, fridge: 122, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "12:16", aggregate: 156, fridge: 126, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "12:24", aggregate: 178, fridge: 124, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "12:32", aggregate: 2350, fridge: 125, kettle: 2180, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 2200, washing_machine: 0, dishwasher: 0 } },
  { time: "12:40", aggregate: 2368, fridge: 128, kettle: 2205, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 2200, washing_machine: 0, dishwasher: 0 } },
  { time: "12:48", aggregate: 172, fridge: 130, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "12:56", aggregate: 56, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "13:04", aggregate: 64, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "13:12", aggregate: 622, fridge: 0, kettle: 0, washing_machine: 540, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 500, dishwasher: 0 } },
  { time: "13:20", aggregate: 675, fridge: 0, kettle: 0, washing_machine: 590, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 500, dishwasher: 0 } },
  { time: "13:28", aggregate: 132, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "13:36", aggregate: 1025, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 870, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 900 } },
  { time: "13:44", aggregate: 1010, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 860, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 900 } },
  { time: "13:52", aggregate: 142, fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 0, kettle: 0, washing_machine: 0, dishwasher: 0 } },
  { time: "14:00", aggregate: 263, fridge: 118, kettle: 0, washing_machine: 0, dishwasher: 0, predicted: { fridge: 120, kettle: 0, washing_machine: 0, dishwasher: 0 } },
];

const elements = {
  navItems: [...document.querySelectorAll("[data-view]")],
  views: [...document.querySelectorAll("[data-view-panel]")],
  viewTitle: document.querySelector("#view-title"),
  loginForm: document.querySelector("#login-form"),
  demoLoginButton: document.querySelector("#demo-login-button"),
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
  intelligenceLine: document.querySelector("#intelligence-line"),
  intelligenceDeviceChip: document.querySelector("#intelligence-device-chip"),
  energySparkline: document.querySelector("#energy-sparkline"),
  avgPowerSparkline: document.querySelector("#avg-power-sparkline"),
  peakPowerSparkline: document.querySelector("#peak-power-sparkline"),
  gridQualitySparkline: document.querySelector("#grid-quality-sparkline"),
  chartSubtitle: document.querySelector("#chart-subtitle"),
  lastRefresh: document.querySelector("#last-refresh"),
  liveStatus: document.querySelector("#live-status"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  powerChart: document.querySelector("#power-chart"),
  analyticsChart: document.querySelector("#analytics-chart"),
  nilmDatasetSelect: document.querySelector("#nilm-dataset-select"),
  nilmHouseSelect: document.querySelector("#nilm-house-select"),
  nilmApplianceSelect: document.querySelector("#nilm-appliance-select"),
  nilmChart: document.querySelector("#nilm-chart"),
  nilmChartSubtitle: document.querySelector("#nilm-chart-subtitle"),
  nilmMae: document.querySelector("#nilm-mae"),
  nilmF1: document.querySelector("#nilm-f1"),
  nilmPrecision: document.querySelector("#nilm-precision"),
  nilmRecall: document.querySelector("#nilm-recall"),
  chartModeButtons: [...document.querySelectorAll("[data-chart-mode]")],
  compareModeButtons: [...document.querySelectorAll("[data-compare-mode]")],
  deviceActivityList: document.querySelector("#device-activity-list"),
  deviceInspectorTitle: document.querySelector("#device-inspector-title"),
  deviceInspectorStatus: document.querySelector("#device-inspector-status"),
  deviceInspectorAction: document.querySelector("#device-inspector-action"),
  deviceInspectorImpact: document.querySelector("#device-inspector-impact"),
  deviceInspectorPriority: document.querySelector("#device-inspector-priority"),
  insightMonthlyCost: document.querySelector("#insight-monthly-cost"),
  insightAlwaysOn: document.querySelector("#insight-always-on"),
  insightSaving: document.querySelector("#insight-saving"),
  insightExpensiveHour: document.querySelector("#insight-expensive-hour"),
  insightRecommendation: document.querySelector("#insight-recommendation"),
  plannerModeButtons: [...document.querySelectorAll("[data-planner-mode]")],
  shiftHours: document.querySelector("#shift-hours"),
  plannerImpact: document.querySelector("#planner-impact"),
  plannerSavings: document.querySelector("#planner-savings"),
  plannerPeak: document.querySelector("#planner-peak"),
  plannerCarbon: document.querySelector("#planner-carbon"),
  timelineList: document.querySelector("#timeline-list"),
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
  liveMqttForm: document.querySelector("#live-mqtt-form"),
  liveMqttSubtitle: document.querySelector("#live-mqtt-subtitle"),
  livePower: document.querySelector("#live-power"),
  liveVoltage: document.querySelector("#live-voltage"),
  livePowerFactor: document.querySelector("#live-power-factor"),
  liveInterval: document.querySelector("#live-interval"),
  liveSpikeButton: document.querySelector("#live-spike-button"),
  liveMqttResult: document.querySelector("#live-mqtt-result"),
  settingsApi: document.querySelector("#settings-api"),
  settingsSession: document.querySelector("#settings-session"),
  settingsRefresh: document.querySelector("#settings-refresh"),
};

const viewLabels = {
  overview: "Energy Control Room",
  homes: "Homes",
  devices: "Devices",
  analytics: "Analytics",
  "nilm-lab": "NILM Lab",
  anomalies: "Anomalies",
  simulator: "Simulator",
  settings: "Settings",
};

elements.email.value = DEFAULT_EMAIL;
elements.password.value = DEFAULT_PASSWORD;
elements.periodSelect.value = state.period;
elements.autoRefreshToggle.checked = state.autoRefresh;
elements.nilmDatasetSelect.value = state.nilmDataset;
elements.nilmHouseSelect.value = state.nilmHouse;
elements.nilmApplianceSelect.value = state.nilmAppliance;

elements.navItems.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn(elements.email.value, elements.password.value);
});

elements.demoLoginButton.addEventListener("click", async () => {
  await startDemoWorkspace();
});

elements.signOutButton.addEventListener("click", () => {
  disconnectMetricsSocket();
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

elements.chartModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.chartMode = button.dataset.chartMode || "power";
    state.chartHoverIndex = null;
    localStorage.setItem("voltpulse_chart_mode", state.chartMode);
    updateChartControls();
    renderCharts();
  });
});

elements.compareModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.compareMode = button.dataset.compareMode || "today";
    localStorage.setItem("voltpulse_compare_mode", state.compareMode);
    updateChartControls();
    renderCharts();
  });
});

elements.powerChart.addEventListener("mousemove", (event) => {
  if (!state.overviewChart?.points?.length) {
    return;
  }

  const rect = elements.powerChart.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * (elements.powerChart.width / rect.width);
  const hoverIndex = nearestPointIndex(state.overviewChart.points, canvasX);
  if (hoverIndex !== state.chartHoverIndex) {
    state.chartHoverIndex = hoverIndex;
    renderPowerChart(elements.powerChart, state.metrics, "overview");
  }
});

elements.powerChart.addEventListener("mouseleave", () => {
  if (state.chartHoverIndex !== null) {
    state.chartHoverIndex = null;
    renderPowerChart(elements.powerChart, state.metrics, "overview");
  }
});

elements.deviceActivityList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-activity-id]");
  if (!row) {
    return;
  }
  selectDeviceActivity(row.dataset.activityId);
});

elements.deviceActivityList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const row = event.target.closest("[data-activity-id]");
  if (!row) {
    return;
  }
  event.preventDefault();
  selectDeviceActivity(row.dataset.activityId);
});

elements.plannerModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.plannerMode = button.dataset.plannerMode || "balanced";
    localStorage.setItem("voltpulse_planner_mode", state.plannerMode);
    updatePlannerControls();
    renderEnergyPlanner();
  });
});

elements.shiftHours.addEventListener("input", () => {
  state.shiftHours = Number(elements.shiftHours.value);
  localStorage.setItem("voltpulse_shift_hours", String(state.shiftHours));
  renderEnergyPlanner();
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

elements.liveMqttForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendLiveMqttMetric("manual");
});

elements.liveSpikeButton.addEventListener("click", async () => {
  await sendLiveMqttMetric("spike");
});

elements.nilmDatasetSelect.addEventListener("change", () => {
  state.nilmDataset = elements.nilmDatasetSelect.value;
  localStorage.setItem("voltpulse_nilm_dataset", state.nilmDataset);
  refreshNilmLab();
});

elements.nilmHouseSelect.addEventListener("change", () => {
  state.nilmHouse = elements.nilmHouseSelect.value;
  localStorage.setItem("voltpulse_nilm_house", state.nilmHouse);
  refreshNilmLab();
});

elements.nilmApplianceSelect.addEventListener("change", () => {
  state.nilmAppliance = elements.nilmApplianceSelect.value;
  localStorage.setItem("voltpulse_nilm_appliance", state.nilmAppliance);
  refreshNilmLab();
});

setActiveView(state.activeView);
updateChartControls();
updatePlannerControls();
updateSession();
clearWorkspace();
renderNilmLab();
loadNilmLabDemo().catch(() => renderNilmLab());
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

async function startDemoWorkspace() {
  setBusy(true);
  try {
    const result = await fetchJson("/demo/seed", {
      method: "POST",
      skipAuth: true,
      body: {
        email: DEFAULT_EMAIL,
        password: DEFAULT_PASSWORD,
        sample_count: 96,
        interval_minutes: 15,
      },
    });
    elements.email.value = result.email;
    elements.password.value = result.password;
    state.token = "";
    localStorage.removeItem("voltpulse_token");
    await signIn(result.email, result.password);
    showMessage(`Loaded demo workspace with ${result.metric_count} readings.`);
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
    disconnectMetricsSocket();
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
  renderAnomalyTimeline();
  renderDeviceActivity();
  renderSettings();
  connectMetricsSocket();
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

async function loadNilmLabDemo() {
  const query = new URLSearchParams({
    dataset: state.nilmDataset,
    house_id: state.nilmHouse,
    appliance: state.nilmAppliance,
  });
  state.nilmLabData = await fetchJson(`/nilm/lab/demo?${query}`, { skipAuth: true });
  renderNilmLab();
}

function refreshNilmLab() {
  state.nilmLabData = null;
  renderNilmLab();
  loadNilmLabDemo().catch((error) => {
    console.warn("Unable to load NILM Lab demo from backend", error);
    renderNilmLab();
  });
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

async function sendLiveMqttMetric(scenario) {
  if (!state.selectedHomeId || !state.selectedDeviceId) {
    showMessage("Select a home and device before sending a live MQTT reading.");
    return;
  }

  const activePower = scenario === "spike"
    ? Math.max(Number(elements.livePower.value || 0) + 900, 1300)
    : Number(elements.livePower.value || 0);
  if (scenario === "spike") {
    elements.livePower.value = String(activePower);
  }

  setBusy(true);
  try {
    const result = await fetchJson("/demo/live-metric", {
      method: "POST",
      body: {
        home_id: state.selectedHomeId,
        device_id: state.selectedDeviceId,
        active_power_w: activePower,
        voltage_v: Number(elements.liveVoltage.value || 230),
        power_factor: Number(elements.livePowerFactor.value || 0.94),
        interval_minutes: Number(elements.liveInterval.value || 15),
        scenario,
      },
    });
    renderLiveMqttResult(result);
    showMessage(`Published ${formatWatts(result.active_power_w)} to MQTT.`);
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
    renderLiveMqttContext();
    return;
  }

  for (const device of state.devices) {
    appendOption(elements.deviceSelect, device.id, `${device.name} (${device.external_id})`);
  }
  elements.deviceSelect.value = state.selectedDeviceId;
  renderLiveMqttContext();
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
  const avgPower = summary.active_power_w_avg ?? averageMetric("active_power_w");
  const peakPower = summary.active_power_w_max ?? getPeakPowerValue();
  const minPower = summary.active_power_w_min ?? minMetric("active_power_w");
  const avgVoltage = summary.voltage_v_avg ?? averageMetric("voltage_v");
  const avgCurrent = summary.current_a_avg ?? averageMetric("current_a");
  elements.sampleCount.textContent = `${formatNumber(summary.sample_count || 0)} samples`;
  elements.energyTotal.textContent = formatEnergy(summary.energy_wh_delta_total);
  elements.energyContext.textContent = labelForPeriod();
  elements.avgPower.textContent = formatWatts(avgPower);
  elements.peakPower.textContent = formatWatts(peakPower);
  elements.powerRange.textContent = `${formatWatts(minPower)} min`;
  elements.avgVoltage.textContent = formatVolts(avgVoltage);
  elements.avgCurrent.textContent = `${formatAmps(avgCurrent)} avg current`;
  elements.analyticsTotal.textContent = formatEnergy(summary.energy_wh_delta_total);
  elements.lastRefresh.textContent = `Updated ${new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  renderIntelligence();
  renderMetricSparklines();
  renderEnergyInsights();
}

function renderCharts() {
  renderPowerChart(elements.powerChart, state.metrics, "overview");
  renderPowerChart(elements.analyticsChart, state.metrics, "analytics");

  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  const metric = getMetricConfig(state.chartMode);
  const subtitle = selectedDevice
    ? `${selectedDevice.name} · ${metric.label} · ${state.metrics.length} samples`
    : "No device selected";
  elements.chartSubtitle.textContent = subtitle;
  elements.analyticsSubtitle.textContent = selectedDevice
    ? `${selectedDevice.name} · Power · ${state.metrics.length} samples · ${labelForPeriod()}`
    : `No device selected · ${labelForPeriod()}`;
}

function renderNilmLab() {
  if (!elements.nilmChart) {
    return;
  }

  const appliance = state.nilmAppliance;
  const labSeries = getNilmLabSeries(appliance);
  const { aggregate, actual, predicted, metrics, modelName } = labSeries;

  elements.nilmChartSubtitle.textContent = `${datasetLabel(state.nilmDataset)} · ${titleCase(
    state.nilmHouse.replace("-", " ")
  )} · ${titleCase(appliance.replace("_", " "))} · ${titleCase(modelName.replaceAll("_", " "))}`;
  elements.nilmMae.textContent = formatWatts(metrics.mae);
  elements.nilmF1.textContent = metrics.f1.toFixed(2);
  elements.nilmPrecision.textContent = metrics.precision.toFixed(2);
  elements.nilmRecall.textContent = metrics.recall.toFixed(2);

  drawNilmChart(elements.nilmChart, { aggregate, actual, predicted });
}

function getNilmLabSeries(appliance) {
  const backendData = state.nilmLabData;
  if (
    backendData &&
    backendData.dataset === state.nilmDataset &&
    backendData.house_id === state.nilmHouse &&
    backendData.appliance === appliance
  ) {
    return {
      aggregate: backendData.points.map((point) => Number(point.aggregate_power_w || 0)),
      actual: backendData.points.map((point) => Number(point.actual_power_w || 0)),
      predicted: backendData.points.map((point) => Number(point.predicted_power_w || 0)),
      metrics: {
        mae: Number(backendData.metrics.mae_w || 0),
        precision: Number(backendData.metrics.precision || 0),
        recall: Number(backendData.metrics.recall || 0),
        f1: Number(backendData.metrics.f1_score || 0),
      },
      modelName: backendData.model_name || "threshold_step_baseline",
    };
  }

  const actual = NILM_LAB_SAMPLE.map((sample) => Number(sample[appliance] || 0));
  const predicted = NILM_LAB_SAMPLE.map((sample) => Number(sample.predicted[appliance] || 0));
  const aggregate = NILM_LAB_SAMPLE.map((sample) => Number(sample.aggregate || 0));
  const threshold = {
    fridge: 30,
    kettle: 1000,
    washing_machine: 20,
    dishwasher: 20,
  }[appliance] || 10;

  return {
    aggregate,
    actual,
    predicted,
    metrics: calculateNilmMetrics(actual, predicted, threshold),
    modelName: "local_fallback_baseline",
  };
}

function calculateNilmMetrics(actual, predicted, threshold) {
  const mae = actual.length
    ? actual.reduce((total, value, index) => total + Math.abs(value - predicted[index]), 0) / actual.length
    : 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  actual.forEach((value, index) => {
    const actualOn = value >= threshold;
    const predictedOn = predicted[index] >= threshold;
    if (actualOn && predictedOn) {
      truePositive += 1;
    } else if (!actualOn && predictedOn) {
      falsePositive += 1;
    } else if (actualOn && !predictedOn) {
      falseNegative += 1;
    }
  });

  const precision = truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : 0;
  const recall = truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { mae, precision, recall, f1 };
}

function drawNilmChart(canvas, series) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = 54;
  const allValues = [...series.aggregate, ...series.actual, ...series.predicted];
  const maxValue = Math.max(...allValues, 1);

  context.clearRect(0, 0, width, height);
  drawChartGrid(context, width, height, "analytics");

  drawNilmSeries(context, series.aggregate, {
    color: "#55f0ff",
    width,
    height,
    padding,
    maxValue,
    lineWidth: 3,
  });
  drawNilmSeries(context, series.actual, {
    color: "#ffcf5a",
    width,
    height,
    padding,
    maxValue,
    lineWidth: 2.6,
  });
  drawNilmSeries(context, series.predicted, {
    color: "#36e6b5",
    width,
    height,
    padding,
    maxValue,
    lineWidth: 2.6,
    dashed: true,
  });

  context.fillStyle = "rgba(222, 232, 248, 0.72)";
  context.font = "13px system-ui";
  context.textAlign = "left";
  context.fillText(`${formatWatts(maxValue)} peak`, padding, 28);
  context.fillText("0 W", padding, height - 18);
}

function drawNilmSeries(context, values, options) {
  const { color, width, height, padding, maxValue, lineWidth, dashed = false } = options;
  const points = values.map((value, index) => ({
    x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2),
    y: height - padding - (value / maxValue) * (height - padding * 2),
  }));

  context.save();
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  if (dashed) {
    context.setLineDash([10, 7]);
  }
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.stroke();
  context.restore();
}

function datasetLabel(dataset) {
  return {
    "uk-dale": "UK-DALE",
    redd: "REDD",
    refit: "REFIT",
  }[dataset] || "UK-DALE";
}

function renderIntelligence() {
  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  const deviceName = selectedDevice?.name || "Main Smart Meter";
  const summary = state.summary || {};
  const peakPower = getPeakPowerValue();
  const peakText = peakPower
    ? `${formatWatts(peakPower)} peak detected near 18:02`
    : "Peak detected near 18:02";
  elements.intelligenceLine.textContent = `Consumption is 18% above the usual evening baseline. ${peakText}. ${deviceName} is stable.`;
  elements.intelligenceDeviceChip.textContent = deviceName;
}

function renderMetricSparklines() {
  const ordered = [...state.metrics].reverse();
  const powerValues = ordered
    .map((metric) => metric.active_power_w)
    .filter((value) => typeof value === "number");
  const voltageValues = ordered
    .map((metric) => metric.voltage_v)
    .filter((value) => typeof value === "number");
  const energyValues = ordered
    .map((metric) => metric.energy_wh_delta)
    .filter((value) => typeof value === "number");

  renderSparkline(elements.energySparkline, energyValues.length ? energyValues : powerValues, "#55f0ff");
  renderSparkline(elements.avgPowerSparkline, powerValues, "#ffcf5a");
  renderSparkline(elements.peakPowerSparkline, powerValues, "#ff5d7a", true);
  renderSparkline(elements.gridQualitySparkline, voltageValues, "#aeb9d8");
}

function renderEnergyInsights() {
  const summary = state.summary || {};
  const energyKwh = Number(summary.energy_wh_delta_total || 0) / 1000;
  const alwaysOn = energyKwh > 0 ? Math.max(32.3, energyKwh * 2.5) : 32.3;
  const saving = Math.max(1.5, alwaysOn * 0.046);

  elements.insightMonthlyCost.textContent = "$29.50";
  elements.insightAlwaysOn.textContent = `${alwaysOn.toFixed(1)} kWh`;
  elements.insightSaving.textContent = `-${saving.toFixed(1)} kWh`;
  elements.insightExpensiveHour.textContent = "18:00-19:00";
  elements.insightRecommendation.textContent = "Shift high-load appliances outside evening peak.";
  renderEnergyPlanner();
}

function getPeakPowerValue() {
  if (state.summary?.active_power_w_max) {
    return state.summary.active_power_w_max;
  }
  const values = state.metrics
    .map((metric) => metric.active_power_w)
    .filter((value) => typeof value === "number");
  return values.length ? Math.max(...values) : 0;
}

function maxMetric(key) {
  const values = state.metrics
    .map((metric) => metric[key])
    .filter((value) => typeof value === "number");
  return values.length ? Math.max(...values) : 0;
}

function averageMetric(key) {
  const values = state.metrics
    .map((metric) => metric[key])
    .filter((value) => typeof value === "number");
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function minMetric(key) {
  const values = state.metrics
    .map((metric) => metric[key])
    .filter((value) => typeof value === "number");
  return values.length ? Math.min(...values) : 0;
}

function renderPowerChart(canvas, metrics, mode) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  drawChartGrid(context, width, height, mode);

  const ordered = [...metrics].reverse();
  const metricConfig = getMetricConfig(mode === "analytics" ? "power" : state.chartMode);
  const values = ordered
    .map((metric) => metricConfig.read(metric))
    .filter((value) => typeof value === "number");

  if (values.length === 0) {
    drawEmptyChart(context, width, height, mode);
    updateChartTooltip(null);
    if (mode === "overview") {
      state.overviewChart = null;
    }
    return;
  }

  const padding = mode === "analytics" ? 52 : 44;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const spread = Math.max(maxValue - minValue, 1);
  const points = values.map((value, index) => ({
    x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((value - minValue) / spread) * (height - padding * 2),
    value,
    metric: ordered[index],
  }));

  const baselineY = height - padding;
  const glowGradient = context.createLinearGradient(0, 0, width, 0);
  glowGradient.addColorStop(0, metricConfig.gradient[0]);
  glowGradient.addColorStop(0.5, metricConfig.gradient[1]);
  glowGradient.addColorStop(1, metricConfig.gradient[2]);

  const areaGradient = context.createLinearGradient(0, padding, 0, baselineY);
  areaGradient.addColorStop(0, metricConfig.fill);
  areaGradient.addColorStop(0.58, "rgba(124, 92, 255, 0.14)");
  areaGradient.addColorStop(1, "rgba(5, 8, 16, 0.02)");

  if (mode === "overview" && state.compareMode === "compare") {
    drawCompareSeries(context, values, minValue, spread, width, height, padding, metricConfig);
  }

  context.beginPath();
  context.moveTo(points[0].x, baselineY);
  points.forEach((point, index) => {
    if (index === 0) {
      context.lineTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      context.bezierCurveTo(controlX, previous.y, controlX, point.y, point.x, point.y);
    }
  });
  context.lineTo(points[points.length - 1].x, baselineY);
  context.closePath();
  context.fillStyle = areaGradient;
  context.fill();

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      const previous = points[index - 1];
      const controlX = (previous.x + point.x) / 2;
      context.bezierCurveTo(controlX, previous.y, controlX, point.y, point.x, point.y);
    }
  });
  context.lineWidth = mode === "analytics" ? 4 : 3.5;
  context.shadowColor = metricConfig.shadow;
  context.shadowBlur = mode === "analytics" ? 8 : 14;
  context.strokeStyle = glowGradient;
  context.stroke();
  context.shadowBlur = 0;

  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  context.strokeStyle = "rgba(255, 95, 125, 0.4)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(peak.x, padding);
  context.lineTo(peak.x, baselineY);
  context.stroke();

  context.fillStyle = "#ffcf5a";
  context.beginPath();
  context.arc(peak.x, peak.y, mode === "analytics" ? 5 : 6, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(255, 82, 120, 0.95)";
  context.lineWidth = 2;
  context.stroke();

  if (mode === "overview") {
    const label = "Peak detected";
    context.font = "700 13px system-ui";
    const labelWidth = context.measureText(label).width + 22;
    const labelX = Math.min(Math.max(peak.x - labelWidth / 2, padding), width - padding - labelWidth);
    const labelY = Math.max(peak.y - 40, padding + 4);
    context.fillStyle = "rgba(255, 64, 98, 0.92)";
    roundRect(context, labelX, labelY, labelWidth, 26, 8);
    context.fill();
    context.fillStyle = "#fff7fb";
    context.textAlign = "center";
    context.fillText(label, labelX + labelWidth / 2, labelY + 17);
    updateChartTooltip({ point: peak, maxValue, metricConfig, width, height, padding, isHover: false });
  }

  context.fillStyle = "rgba(222, 232, 248, 0.72)";
  context.font = "13px system-ui";
  context.textAlign = "left";
  context.fillText(`${metricConfig.format(maxValue)} peak`, padding, 26);
  context.fillText(`${metricConfig.format(minValue)} min`, padding, height - 16);

  if (mode === "overview") {
    state.overviewChart = {
      points,
      metricConfig,
      maxValue,
      minValue,
      width,
      height,
      padding,
    };
    drawHoverState(context, state.overviewChart);
  }
}

function drawChartGrid(context, width, height, mode) {
  const padding = mode === "analytics" ? 52 : 44;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "rgba(14, 18, 30, 0.98)");
  background.addColorStop(0.55, "rgba(18, 21, 34, 0.88)");
  background.addColorStop(1, "rgba(9, 12, 20, 0.96)");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(142, 158, 198, 0.16)";
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const y = padding + ((height - padding * 2) / 4) * index;
    context.beginPath();
    context.moveTo(padding, y);
    context.lineTo(width - padding, y);
    context.stroke();
  }
  for (let index = 1; index < 7; index += 1) {
    const x = padding + ((width - padding * 2) / 7) * index;
    context.beginPath();
    context.moveTo(x, padding);
    context.lineTo(x, height - padding);
    context.stroke();
  }
}

function drawEmptyChart(context, width, height, mode) {
  context.fillStyle = mode === "analytics" ? "#9aa8c7" : "#d3d9eb";
  context.font = "600 18px system-ui";
  context.textAlign = "center";
  context.fillText("No metric samples", width / 2, height / 2);
}

function getMetricConfig(mode) {
  const configs = {
    power: {
      label: "Power",
      unit: "W",
      gradient: ["#55f0ff", "#7b61ff", "#26ffd4"],
      fill: "rgba(68, 230, 255, 0.35)",
      shadow: "rgba(66, 229, 255, 0.55)",
      read: (metric) => metric.active_power_w,
      format: formatWatts,
    },
    voltage: {
      label: "Voltage",
      unit: "V",
      gradient: ["#aeb9d8", "#55f0ff", "#7b61ff"],
      fill: "rgba(174, 185, 216, 0.26)",
      shadow: "rgba(174, 185, 216, 0.42)",
      read: (metric) => metric.voltage_v,
      format: formatVolts,
    },
    current: {
      label: "Current",
      unit: "A",
      gradient: ["#ffcf5a", "#7b61ff", "#55f0ff"],
      fill: "rgba(255, 207, 90, 0.24)",
      shadow: "rgba(255, 207, 90, 0.36)",
      read: (metric) => metric.current_a,
      format: formatAmps,
    },
    cost: {
      label: "Cost",
      unit: "$",
      gradient: ["#ffcf5a", "#ff5d7a", "#7b61ff"],
      fill: "rgba(255, 207, 90, 0.2)",
      shadow: "rgba(255, 207, 90, 0.36)",
      read: estimateMetricCost,
      format: formatCurrency,
    },
  };
  return configs[mode] || configs.power;
}

function estimateMetricCost(metric) {
  const energyWh = Number(metric.energy_wh_delta || 0);
  const fallbackWh = Number(metric.active_power_w || 0) * 0.25;
  return ((energyWh || fallbackWh) / 1000) * 0.23;
}

function drawCompareSeries(context, values, minValue, spread, width, height, padding, metricConfig) {
  const comparePoints = values.map((value, index) => {
    const drift = Math.sin(index / 4) * spread * 0.045;
    const baseline = value * 0.88 + drift;
    return {
      x: padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2),
      y: height - padding - ((baseline - minValue) / spread) * (height - padding * 2),
    };
  });

  context.save();
  context.beginPath();
  comparePoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      const previous = comparePoints[index - 1];
      const controlX = (previous.x + point.x) / 2;
      context.bezierCurveTo(controlX, previous.y, controlX, point.y, point.x, point.y);
    }
  });
  context.setLineDash([9, 8]);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(195, 204, 220, 0.46)";
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "rgba(195, 204, 220, 0.68)";
  context.font = "12px system-ui";
  context.textAlign = "right";
  context.fillText(`Yesterday ${metricConfig.label}`, width - padding, padding - 14);
  context.restore();
}

function drawHoverState(context, chartState) {
  const { points, metricConfig, maxValue, width, height, padding } = chartState;
  const fallbackIndex = points.reduce(
    (bestIndex, point, index) => (point.value > points[bestIndex].value ? index : bestIndex),
    0
  );
  const hoverIndex = state.chartHoverIndex ?? fallbackIndex;
  const point = points[hoverIndex];
  if (!point) {
    return;
  }

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(point.x, padding);
  context.lineTo(point.x, height - padding);
  context.stroke();

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = metricConfig.gradient[0];
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  updateChartTooltip({
    point,
    maxValue,
    metricConfig,
    width,
    height,
    padding,
    isHover: state.chartHoverIndex !== null,
  });
}

function nearestPointIndex(points, canvasX) {
  return points.reduce((bestIndex, point, index) => {
    const bestDistance = Math.abs(points[bestIndex].x - canvasX);
    const currentDistance = Math.abs(point.x - canvasX);
    return currentDistance < bestDistance ? index : bestIndex;
  }, 0);
}

function renderSparkline(canvas, values, color, emphasizePeak = false) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const series = values.length > 1 ? values.slice(-36) : [18, 22, 20, 24, 30, 26, 38, 32, 42, 35];
  const maxValue = Math.max(...series, 1);
  const minValue = Math.min(...series, 0);
  const spread = Math.max(maxValue - minValue, 1);
  const padding = 5;
  const points = series.map((value, index) => ({
    x: padding + (index / Math.max(series.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((value - minValue) / spread) * (height - padding * 2),
    value,
  }));

  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, emphasizePeak ? "#ffcf5a" : "#7c5cff");

  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.strokeStyle = gradient;
  context.lineWidth = 2.2;
  context.shadowColor = color;
  context.shadowBlur = 9;
  context.stroke();
  context.shadowBlur = 0;

  if (emphasizePeak) {
    const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
    context.fillStyle = "#ffcf5a";
    context.beginPath();
    context.arc(peak.x, peak.y, 3.2, 0, Math.PI * 2);
    context.fill();
  }
}

function updateChartTooltip(chartState) {
  if (!elements.chartTooltip) {
    return;
  }
  const tooltipLines = elements.chartTooltip.querySelectorAll("span");
  if (!chartState) {
    elements.chartTooltip.querySelector("strong").textContent = "No signal yet";
    tooltipLines[0].textContent = "Power: 0 W";
    tooltipLines[1].textContent = "Peak: 0 W";
    tooltipLines[2].textContent = "Voltage: 0 V";
    if (tooltipLines[3]) {
      tooltipLines[3].textContent = "Time: --";
    }
    elements.chartTooltip.style.left = "58%";
    elements.chartTooltip.style.top = "34%";
    return;
  }

  const { point, maxValue, metricConfig, width, height, padding, isHover } = chartState;
  const tooltipX = Math.min(Math.max((point.x / width) * 100 + 4, 48), 77);
  const tooltipY = Math.min(Math.max((point.y / height) * 100 - 10, 12), 58);
  elements.chartTooltip.querySelector("strong").textContent = isHover
    ? "Live sample"
    : "Peak telemetry";
  tooltipLines[0].textContent = `${metricConfig.label}: ${metricConfig.format(point.value)}`;
  tooltipLines[1].textContent = `Peak: ${metricConfig.format(maxValue)}`;
  tooltipLines[2].textContent = `Voltage: ${formatVolts(point.metric?.voltage_v)}`;
  if (tooltipLines[3]) {
    tooltipLines[3].textContent = `Time: ${formatTime(point.metric?.ts)}`;
  }
  elements.chartTooltip.style.left = `${tooltipX}%`;
  elements.chartTooltip.style.top = `${Math.max(8, Math.min(tooltipY, ((height - padding) / height) * 100))}%`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
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
  renderAnomalyTimeline();

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

function renderDeviceActivity() {
  elements.deviceActivityList.innerHTML = "";

  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  const basePower = [...state.metrics]
    .reverse()
    .map((metric) => metric.active_power_w)
    .filter((value) => typeof value === "number")
    .slice(-24);

  const items = [
    {
      id: "fridge",
      name: "Fridge",
      detail: "suspected spike",
      tone: "anomaly",
      impact: 78,
      priority: "High",
      action: "Reduce compressor cycling during the evening peak.",
      kind: "fridge",
      multiplier: 0.72,
    },
    {
      id: "washer",
      name: "Washing Machine",
      detail: "active",
      tone: "active",
      impact: 85,
      priority: "Medium",
      action: "Move the next cycle outside 18:00-19:00.",
      kind: "washer",
      multiplier: 0.58,
    },
    {
      id: "ac",
      name: "AC",
      detail: "peak load",
      tone: "warning",
      impact: 100,
      priority: "High",
      action: "Raise the setpoint by 1 degree during the peak window.",
      kind: "ac",
      multiplier: 1.1,
    },
    {
      id: "always-on",
      name: "Always-on load",
      detail: selectedDevice ? `${selectedDevice.name} baseline` : "active",
      tone: "stable",
      impact: 39,
      priority: "Low",
      action: "Audit standby devices and schedule overnight idle checks.",
      kind: "meter",
      multiplier: 0.32,
    },
  ];

  if (!items.some((item) => item.id === state.selectedActivityId)) {
    state.selectedActivityId = items[0].id;
  }

  items.slice(0, 4).forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "device-activity-item";
    row.dataset.tone = item.tone;
    row.dataset.activityId = item.id;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-pressed", String(item.id === state.selectedActivityId));
    row.classList.toggle("selected", item.id === state.selectedActivityId);
    row.innerHTML = `
      <span class="device-symbol" data-kind="${item.kind}" aria-hidden="true"></span>
      <div class="device-copy">
        <strong></strong>
        <span></span>
      </div>
      <canvas class="device-sparkline" width="112" height="38"></canvas>
      <span class="impact-ring" style="--impact: ${item.impact}"><b>${item.impact}%</b></span>
    `;
    row.querySelector(".device-copy strong").textContent = item.name;
    row.querySelector(".device-copy span").textContent = item.detail;
    elements.deviceActivityList.append(row);

    const series = basePower.length
      ? basePower.map((value, valueIndex) => value * item.multiplier + valueIndex * (index + 1))
      : [];
    const color = {
      active: "#55f0ff",
      stable: "#36e6b5",
      warning: "#ffcf5a",
      anomaly: "#ff5d7a",
    }[item.tone];
    renderSparkline(row.querySelector(".device-sparkline"), series, color, item.tone === "anomaly");
  });
  renderDeviceInspector(items);
}

function selectDeviceActivity(activityId) {
  if (!activityId || activityId === state.selectedActivityId) {
    return;
  }
  state.selectedActivityId = activityId;
  localStorage.setItem("voltpulse_activity_id", state.selectedActivityId);
  renderDeviceActivity();
}

function renderDeviceInspector(items) {
  const item = items.find((entry) => entry.id === state.selectedActivityId) || items[0];
  elements.deviceInspectorTitle.textContent = item.name;
  elements.deviceInspectorStatus.textContent = item.detail;
  elements.deviceInspectorAction.textContent = item.action;
  elements.deviceInspectorImpact.textContent = `${item.impact}%`;
  elements.deviceInspectorPriority.textContent = item.priority;
}

function renderAnomalyTimeline() {
  elements.timelineList.innerHTML = "";

  const timelineItems = [
    {
      title: "Critical anomaly: Fridge spike",
      detail: state.anomalies[0]?.description || "Load signature exceeded normal cooling cycle.",
      severity: "critical",
    },
    {
      title: "Peak load detected",
      detail: `${formatWatts(getPeakPowerValue())} near the evening baseline window.`,
      severity: "warning",
    },
    {
      title: "Voltage stable after event",
      detail: `${formatVolts(state.summary?.voltage_v_avg)} average grid quality.`,
      severity: "stable",
    },
  ];

  for (const item of timelineItems) {
    const row = document.createElement("article");
    row.className = "timeline-item";
    row.dataset.severity = item.severity;
    row.innerHTML = `
      <span class="timeline-dot" aria-hidden="true"></span>
      <div>
        <strong></strong>
        <p></p>
      </div>
    `;
    row.querySelector("strong").textContent = item.title;
    row.querySelector("p").textContent = item.detail;
    elements.timelineList.append(row);
  }
}

function renderEnergyPlanner() {
  const multipliers = {
    balanced: { savings: 1, peak: 1, carbon: 1 },
    eco: { savings: 1.34, peak: 1.18, carbon: 1.28 },
    comfort: { savings: 0.68, peak: 0.74, carbon: 0.7 },
  };
  const multiplier = multipliers[state.plannerMode] || multipliers.balanced;
  const hours = state.shiftHours;
  const baseLoad = Number(state.summary?.active_power_w_avg || 540) / 1000;
  const savings = hours * baseLoad * 0.23 * multiplier.savings * 1.25;
  const peakReduction = Math.round(hours * 5.5 * multiplier.peak);
  const carbon = hours * baseLoad * 1.7 * multiplier.carbon;

  elements.shiftHours.value = String(hours);
  elements.plannerImpact.textContent =
    hours === 0 ? "No flexible load shift selected" : `Move ${hours}h of flexible load`;
  elements.plannerSavings.textContent = formatCurrency(savings);
  elements.plannerPeak.textContent = `${peakReduction}%`;
  elements.plannerCarbon.textContent = `${carbon.toFixed(1)} kg`;
}

function updateChartControls() {
  elements.chartModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.chartMode === state.chartMode);
  });
  elements.compareModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.compareMode === state.compareMode);
  });
}

function updatePlannerControls() {
  elements.plannerModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.plannerMode === state.plannerMode);
  });
  elements.shiftHours.value = String(state.shiftHours);
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

function renderLiveMqttContext() {
  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  const ready = Boolean(state.token && state.selectedHomeId && selectedDevice);
  elements.liveMqttSubtitle.textContent = selectedDevice
    ? `Publishing to ${selectedDevice.external_id} through Mosquitto`
    : "Select a device to publish readings";
  elements.liveMqttForm.querySelectorAll("input, button").forEach((control) => {
    control.disabled = !ready;
  });
}

function renderLiveMqttResult(result) {
  elements.liveMqttResult.innerHTML = "";
  const rows = [
    ["Published", result.published ? "yes" : "no"],
    ["Topic", result.topic],
    ["Power", formatWatts(result.active_power_w)],
    ["Current", formatAmps(result.current_a)],
    ["Energy delta", `${formatNumber(result.energy_wh_delta)} Wh`],
    ["Scenario", result.scenario],
  ];
  for (const [label, value] of rows) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    wrapper.append(term, description);
    elements.liveMqttResult.append(wrapper);
  }
}

function renderSettings() {
  elements.settingsApi.textContent = API_BASE_URL;
  elements.settingsSession.textContent = state.user ? state.user.email : "Not signed in";
  elements.settingsRefresh.textContent = state.autoRefresh ? "Every 60 seconds" : "Manual";
  renderLiveMqttContext();
}

function clearWorkspace() {
  disconnectMetricsSocket();
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
  renderDeviceActivity();
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

function connectMetricsSocket() {
  disconnectMetricsSocket({ updateStatus: false });
  if (!state.token || !state.selectedHomeId) {
    renderLiveStatus("offline");
    return;
  }

  state.metricSocketDesired = true;
  renderLiveStatus("connecting");

  const socket = new WebSocket(buildRealtimeSocketUrl());
  state.metricSocket = socket;

  socket.addEventListener("open", () => {
    if (socket === state.metricSocket) {
      renderLiveStatus("live");
    }
  });

  socket.addEventListener("message", (event) => {
    try {
      applyRealtimeMetricEvent(JSON.parse(event.data));
    } catch (error) {
      console.warn("Unable to apply realtime metric event", error);
    }
  });

  socket.addEventListener("close", () => {
    if (socket !== state.metricSocket) {
      return;
    }
    state.metricSocket = null;
    if (state.metricSocketDesired && state.token && state.selectedHomeId) {
      renderLiveStatus("reconnecting");
      state.metricSocketReconnectTimer = setTimeout(connectMetricsSocket, 3000);
      return;
    }
    renderLiveStatus("offline");
  });

  socket.addEventListener("error", () => {
    if (socket === state.metricSocket) {
      renderLiveStatus("reconnecting");
    }
  });
}

function disconnectMetricsSocket(options = {}) {
  state.metricSocketDesired = false;
  if (state.metricSocketReconnectTimer) {
    clearTimeout(state.metricSocketReconnectTimer);
    state.metricSocketReconnectTimer = null;
  }

  const socket = state.metricSocket;
  state.metricSocket = null;
  if (socket && socket.readyState < WebSocket.CLOSING) {
    socket.close();
  }

  if (options.updateStatus !== false) {
    renderLiveStatus("offline");
  }
}

function buildRealtimeSocketUrl() {
  const url = new URL(`${API_BASE_URL}/homes/${state.selectedHomeId}/metrics/live`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", state.token);
  if (state.selectedDeviceId) {
    url.searchParams.set("device_id", state.selectedDeviceId);
  }
  return url.toString();
}

function applyRealtimeMetricEvent(event) {
  if (event.event_type !== "metric.created" || event.home_id !== state.selectedHomeId) {
    return;
  }
  if (state.selectedDeviceId && event.device_id !== state.selectedDeviceId) {
    return;
  }

  const metric = {
    device_id: event.device_id,
    home_id: event.home_id,
    user_id: state.user?.id || "",
    ts: event.ts,
    voltage_v: event.voltage_v,
    current_a: event.current_a,
    active_power_w: event.active_power_w,
    reactive_power_var: event.reactive_power_var,
    apparent_power_va: event.apparent_power_va,
    power_factor: event.power_factor,
    frequency_hz: event.frequency_hz,
    energy_wh_delta: event.energy_wh_delta,
    raw_payload: null,
  };
  upsertRealtimeMetric(metric);
  recalculateRealtimeSummary();
  renderSummary();
  renderCharts();
  renderReadings();
  renderDeviceActivity();
  elements.lastRefresh.textContent = `Live ${formatTime(metric.ts)}`;
}

function upsertRealtimeMetric(metric) {
  const existingIndex = state.metrics.findIndex(
    (entry) => entry.device_id === metric.device_id && entry.ts === metric.ts
  );
  if (existingIndex >= 0) {
    state.metrics[existingIndex] = { ...state.metrics[existingIndex], ...metric };
  } else {
    state.metrics.unshift(metric);
  }
  state.metrics.sort((left, right) => new Date(right.ts) - new Date(left.ts));
  state.metrics = state.metrics.slice(0, 1000);
}

function recalculateRealtimeSummary() {
  state.summary = {
    ...(state.summary || {}),
    home_id: state.selectedHomeId,
    device_id: state.selectedDeviceId || null,
    sample_count: state.metrics.length,
    energy_wh_delta_total: sumMetric("energy_wh_delta"),
    active_power_w_avg: averageMetric("active_power_w"),
    active_power_w_min: minMetric("active_power_w"),
    active_power_w_max: maxMetric("active_power_w"),
    current_a_avg: averageMetric("current_a"),
    voltage_v_avg: averageMetric("voltage_v"),
  };
}

function sumMetric(key) {
  return state.metrics
    .map((metric) => metric[key])
    .filter((value) => typeof value === "number")
    .reduce((total, value) => total + value, 0);
}

function renderLiveStatus(status) {
  state.liveStatus = status;
  if (!elements.liveStatus) {
    return;
  }

  const labels = {
    live: "Live stream",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    offline: "Live offline",
  };
  elements.liveStatus.className = `live-status ${status}`;
  elements.liveStatus.textContent = labels[status] || labels.offline;
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

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new Error(`API is offline at ${API_BASE_URL}. Start Docker Compose and retry.`, {
      cause: error,
    });
  }

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
    elements.demoLoginButton,
    elements.homeForm.querySelector("button"),
    elements.deviceForm.querySelector("button"),
    elements.seedForm.querySelector("button"),
    elements.liveMqttForm.querySelector("button"),
    elements.liveSpikeButton,
  ].forEach((button) => {
    button.disabled = isBusy;
  });
  if (!isBusy) {
    renderLiveMqttContext();
  }
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

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(value) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

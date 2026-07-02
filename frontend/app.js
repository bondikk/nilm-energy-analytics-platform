const API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_EMAIL = "demo@voltpulse.local";
const DEFAULT_PASSWORD = "demo-password";

const state = {
  token: localStorage.getItem("voltpulse_token") || "",
  homes: [],
  devices: [],
  selectedHomeId: "",
  selectedDeviceId: "",
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  sessionLabel: document.querySelector("#session-label"),
  signOutButton: document.querySelector("#sign-out-button"),
  refreshButton: document.querySelector("#refresh-button"),
  homeSelect: document.querySelector("#home-select"),
  deviceSelect: document.querySelector("#device-select"),
  message: document.querySelector("#message"),
  sampleCount: document.querySelector("#sample-count"),
  energyTotal: document.querySelector("#energy-total"),
  avgPower: document.querySelector("#avg-power"),
  peakPower: document.querySelector("#peak-power"),
  chartSubtitle: document.querySelector("#chart-subtitle"),
  powerChart: document.querySelector("#power-chart"),
  anomalyCount: document.querySelector("#anomaly-count"),
  anomalyList: document.querySelector("#anomaly-list"),
};

elements.email.value = DEFAULT_EMAIL;
elements.password.value = DEFAULT_PASSWORD;

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn();
});

elements.signOutButton.addEventListener("click", () => {
  state.token = "";
  localStorage.removeItem("voltpulse_token");
  updateSession();
  clearDashboard();
});

elements.refreshButton.addEventListener("click", () => {
  loadDashboard().catch(showError);
});

elements.homeSelect.addEventListener("change", async () => {
  state.selectedHomeId = elements.homeSelect.value;
  await loadDevices();
  await loadSelectedDeviceData();
});

elements.deviceSelect.addEventListener("change", async () => {
  state.selectedDeviceId = elements.deviceSelect.value;
  await loadSelectedDeviceData();
});

updateSession();
clearDashboard();
if (state.token) {
  loadDashboard().catch(showError);
}

async function signIn() {
  setBusy(true);
  try {
    const response = await fetchJson("/auth/login", {
      method: "POST",
      body: {
        email: elements.email.value,
        password: elements.password.value,
      },
    });
    state.token = response.access_token;
    localStorage.setItem("voltpulse_token", state.token);
    updateSession();
    await loadDashboard();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function loadDashboard() {
  if (!state.token) {
    showMessage("Sign in to load the dashboard.");
    return;
  }

  hideMessage();
  state.homes = await fetchJson("/homes");
  renderHomeOptions();

  if (!state.selectedHomeId && state.homes.length > 0) {
    state.selectedHomeId = state.homes[0].id;
  }
  elements.homeSelect.value = state.selectedHomeId;

  await loadDevices();
  await loadSelectedDeviceData();
}

async function loadDevices() {
  state.devices = [];
  state.selectedDeviceId = "";
  elements.deviceSelect.innerHTML = "";

  if (!state.selectedHomeId) {
    clearDashboard();
    showMessage("No homes found. Seed demo data or create a home in Swagger.");
    return;
  }

  state.devices = await fetchJson(`/homes/${state.selectedHomeId}/devices`);
  renderDeviceOptions();

  if (state.devices.length > 0) {
    state.selectedDeviceId = state.devices[0].id;
    elements.deviceSelect.value = state.selectedDeviceId;
  }
}

async function loadSelectedDeviceData() {
  if (!state.selectedHomeId) {
    clearDashboard();
    return;
  }

  const summaryPath = state.selectedDeviceId
    ? `/homes/${state.selectedHomeId}/analytics/summary?device_id=${state.selectedDeviceId}`
    : `/homes/${state.selectedHomeId}/analytics/summary`;
  const metricsPath = state.selectedDeviceId
    ? `/homes/${state.selectedHomeId}/devices/${state.selectedDeviceId}/metrics?limit=96`
    : "";

  const [summary, metrics, anomalies] = await Promise.all([
    fetchJson(summaryPath),
    metricsPath ? fetchJson(metricsPath) : Promise.resolve([]),
    fetchJson(`/homes/${state.selectedHomeId}/anomalies?limit=20`),
  ]);

  renderSummary(summary);
  renderChart(metrics);
  renderAnomalies(anomalies);
}

function renderHomeOptions() {
  elements.homeSelect.innerHTML = "";
  for (const home of state.homes) {
    const option = document.createElement("option");
    option.value = home.id;
    option.textContent = home.name;
    elements.homeSelect.append(option);
  }
}

function renderDeviceOptions() {
  elements.deviceSelect.innerHTML = "";
  for (const device of state.devices) {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = `${device.name} (${device.external_id})`;
    elements.deviceSelect.append(option);
  }
}

function renderSummary(summary) {
  elements.sampleCount.textContent = formatNumber(summary.sample_count);
  elements.energyTotal.textContent = formatEnergy(summary.energy_wh_delta_total);
  elements.avgPower.textContent = formatWatts(summary.active_power_w_avg);
  elements.peakPower.textContent = formatWatts(summary.active_power_w_max);
}

function renderChart(metrics) {
  const canvas = elements.powerChart;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const ordered = [...metrics].reverse();
  const values = ordered
    .map((metric) => metric.active_power_w)
    .filter((value) => typeof value === "number");

  const selectedDevice = state.devices.find((device) => device.id === state.selectedDeviceId);
  elements.chartSubtitle.textContent = selectedDevice
    ? `${selectedDevice.name} · ${values.length} samples`
    : "No device selected";

  drawGrid(context, width, height);

  if (values.length === 0) {
    context.fillStyle = "#65717e";
    context.font = "18px system-ui";
    context.textAlign = "center";
    context.fillText("No metric samples", width / 2, height / 2);
    return;
  }

  const padding = 32;
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const spread = Math.max(maxValue - minValue, 1);

  context.beginPath();
  values.forEach((value, index) => {
    const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / spread) * (height - padding * 2);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.lineWidth = 4;
  context.strokeStyle = "#146ef5";
  context.stroke();

  context.lineTo(width - padding, height - padding);
  context.lineTo(padding, height - padding);
  context.closePath();
  context.fillStyle = "rgba(20, 110, 245, 0.10)";
  context.fill();

  context.fillStyle = "#65717e";
  context.font = "14px system-ui";
  context.textAlign = "left";
  context.fillText(`${Math.round(maxValue)} W`, padding, 22);
}

function drawGrid(context, width, height) {
  context.strokeStyle = "#e7edf2";
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const y = (height / 5) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function renderAnomalies(anomalies) {
  elements.anomalyCount.textContent = `${anomalies.length} items`;
  elements.anomalyList.innerHTML = "";

  if (anomalies.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No anomalies";
    elements.anomalyList.append(empty);
    return;
  }

  for (const anomaly of anomalies) {
    const item = document.createElement("article");
    item.className = "anomaly-item";
    item.innerHTML = `
      <div class="anomaly-row">
        <span class="anomaly-title"></span>
        <span class="pill ${anomaly.severity}"></span>
      </div>
      <span></span>
      <small></small>
    `;
    item.querySelector(".anomaly-title").textContent = anomaly.title;
    item.querySelector(".pill").textContent = anomaly.severity;
    item.querySelector("span:not(.anomaly-title):not(.pill)").textContent = anomaly.status;
    item.querySelector("small").textContent = formatDate(anomaly.detected_at);
    elements.anomalyList.append(item);
  }
}

async function fetchJson(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.token) {
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

function updateSession() {
  elements.sessionLabel.textContent = state.token ? "Signed in" : "Not signed in";
  elements.loginForm.hidden = Boolean(state.token);
  elements.signOutButton.hidden = !state.token;
}

function clearDashboard() {
  elements.homeSelect.innerHTML = "";
  elements.deviceSelect.innerHTML = "";
  renderSummary({
    sample_count: 0,
    energy_wh_delta_total: 0,
    active_power_w_avg: 0,
    active_power_w_max: 0,
  });
  renderChart([]);
  renderAnomalies([]);
}

function setBusy(isBusy) {
  elements.loginForm.querySelector("button").disabled = isBusy;
  elements.refreshButton.disabled = isBusy;
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

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatWatts(value) {
  if (value === null || value === undefined) {
    return "0 W";
  }
  return `${Math.round(value).toLocaleString("en-US")} W`;
}

function formatEnergy(value) {
  if (!value) {
    return "0 kWh";
  }
  return `${(value / 1000).toFixed(2)} kWh`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

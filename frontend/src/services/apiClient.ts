import type {
  AnomalyRead,
  DemoLiveMetricResponse,
  DemoSeedResponse,
  DeviceRead,
  EnergyMetricRead,
  EnergySummaryRead,
  HomeRead,
  NILMLabCatalogRead,
  NILMLabDatasetConversionRead,
  NILMLabDatasetDownloadGuideRead,
  NILMLabDatasetFilesRead,
  NILMLabDatasetProfileRead,
  NILMLabDatasetsRead,
  NILMLabDemoRead,
  NILMLabReportRead,
  TokenResponse,
  UserRead,
  UUID,
} from "../types/api";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions extends RequestInit {
  token?: string;
  query?: Record<string, QueryValue>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message);
  }
}

function withQuery(path: string, query?: Record<string, QueryValue>) {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${withQuery(path, options.query)}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : response.statusText;
    throw new ApiError(detail, response.status, payload);
  }

  return payload as T;
}

export const apiClient = {
  login(email: string, password: string) {
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  me(token: string) {
    return request<UserRead>("/users/me", { token });
  },
  homes(token: string) {
    return request<HomeRead[]>("/homes", { token });
  },
  devices(token: string, homeId: UUID) {
    return request<DeviceRead[]>(`/homes/${homeId}/devices`, { token });
  },
  summary(token: string, homeId: UUID, deviceId?: UUID) {
    return request<EnergySummaryRead>(`/homes/${homeId}/analytics/summary`, {
      token,
      query: { device_id: deviceId },
    });
  },
  metrics(token: string, homeId: UUID, deviceId: UUID, limit = 300) {
    return request<EnergyMetricRead[]>(`/homes/${homeId}/devices/${deviceId}/metrics`, {
      token,
      query: { limit },
    });
  },
  anomalies(token: string, homeId: UUID) {
    return request<AnomalyRead[]>(`/homes/${homeId}/anomalies`, { token });
  },
  nilmCatalog() {
    return request<NILMLabCatalogRead>("/nilm/lab/catalog");
  },
  nilmDatasets() {
    return request<NILMLabDatasetsRead>("/nilm/lab/datasets");
  },
  nilmDatasetFiles(dataset: string, maxFiles = 80) {
    return request<NILMLabDatasetFilesRead>(`/nilm/lab/datasets/${dataset}/files`, {
      query: { max_files: maxFiles },
    });
  },
  nilmDatasetProfile(dataset: string, maxFiles = 6, filePath?: string) {
    return request<NILMLabDatasetProfileRead>(`/nilm/lab/datasets/${dataset}/profile`, {
      query: { max_files: maxFiles, file_path: filePath },
    });
  },
  nilmDatasetDownloadGuide(dataset: string) {
    return request<NILMLabDatasetDownloadGuideRead>(
      `/nilm/lab/datasets/${dataset}/download-guide`,
    );
  },
  nilmDatasetConvert(dataset: string) {
    return request<NILMLabDatasetConversionRead>(`/nilm/lab/datasets/${dataset}/convert`, {
      method: "POST",
    });
  },
  nilmDemo(dataset: string, houseId: string, appliance: string) {
    return request<NILMLabDemoRead>("/nilm/lab/demo", {
      query: { dataset, house_id: houseId, appliance },
    });
  },
  nilmReport(dataset: string, houseId: string, appliance: string) {
    return request<NILMLabReportRead>("/nilm/lab/report", {
      query: { dataset, house_id: houseId, appliance },
    });
  },
  seedDemo(payload: {
    email: string;
    password: string;
    sample_count: number;
    interval_minutes: number;
  }) {
    return request<DemoSeedResponse>("/demo/seed", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  publishLiveMetric(
    token: string,
    payload: {
      home_id: UUID;
      device_id: UUID;
      active_power_w: number;
      voltage_v: number;
      power_factor: number;
      interval_minutes: number;
      scenario: string;
    },
  ) {
    return request<DemoLiveMetricResponse>("/demo/live-metric", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    });
  },
};

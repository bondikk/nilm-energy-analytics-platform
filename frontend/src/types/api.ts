export type UUID = string;

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserRead {
  id: UUID;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HomeRead {
  id: UUID;
  owner_id: UUID;
  name: string;
  timezone: string;
  location_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceRead {
  id: UUID;
  home_id: UUID;
  external_id: string;
  name: string;
  device_type: string;
  status: string;
  firmware_version: string | null;
  sampling_rate_hz: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnergyMetricRead {
  device_id: UUID;
  ts: string;
  user_id: UUID;
  home_id: UUID;
  voltage_v: number | null;
  current_a: number | null;
  active_power_w: number | null;
  reactive_power_var: number | null;
  apparent_power_va: number | null;
  power_factor: number | null;
  frequency_hz: number | null;
  energy_wh_delta: number | null;
  raw_payload: Record<string, unknown> | null;
}

export interface EnergySummaryRead {
  home_id: UUID;
  device_id: UUID | null;
  start: string | null;
  end: string | null;
  sample_count: number;
  energy_wh_delta_total: number | null;
  active_power_w_avg: number | null;
  active_power_w_min: number | null;
  active_power_w_max: number | null;
  current_a_avg: number | null;
  voltage_v_avg: number | null;
}

export interface AnomalyRead {
  id: UUID;
  user_id: UUID;
  home_id: UUID;
  device_id: UUID | null;
  anomaly_type: string;
  severity: string;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  title: string;
  description: string | null;
  score: number | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface LiveNILMReadingPointRead {
  ts: string;
  power_w: number;
  smoothed_power_w: number;
  voltage_v: number | null;
  current_a: number | null;
}

export interface LiveNILMEventRead {
  event_id: string;
  ts: string;
  direction: "on" | "off";
  step_magnitude_w: number;
  before_power_w: number;
  after_power_w: number;
  estimated_appliance: string;
  confidence: number;
  duration_seconds: number | null;
  source_signal: string;
  explanation: string;
  limitations: string[];
}

export interface LiveNILMApplianceEstimateRead {
  appliance: string;
  label: string;
  estimated_power_w: number;
  confidence: number;
  state: string;
  source_event_id: string | null;
  explanation: string;
}

export interface LiveNILMCurrentRead {
  home_id: UUID;
  device_id: UUID | null;
  current_power_w: number;
  voltage_v: number | null;
  current_a: number | null;
  base_load_w: number;
  unknown_load_w: number;
  source_signal: string;
  signal_unit: string;
  latest_sample_at: string | null;
  appliance_estimates: LiveNILMApplianceEstimateRead[];
  last_event: LiveNILMEventRead | null;
  limitations: string[];
}

export interface LiveNILMSignalSummaryRead {
  sample_count: number;
  start_at: string | null;
  end_at: string | null;
  source_signal: string;
  min_power_w: number | null;
  mean_power_w: number | null;
  max_power_w: number | null;
  base_load_w: number;
  peak_to_base_w: number;
  step_count: number;
  voltage_estimated: boolean;
  quality_flags: string[];
}

export interface LiveNILMSummaryRead {
  home_id: UUID;
  device_id: UUID | null;
  current: LiveNILMCurrentRead;
  signal: LiveNILMSignalSummaryRead;
  events: LiveNILMEventRead[];
  recent_points: LiveNILMReadingPointRead[];
}

export interface NILMLabMetricsRead {
  mae_w: number;
  rmse_w: number;
  precision: number;
  recall: number;
  f1_score: number;
}

export interface NILMLabPointRead {
  ts: string;
  aggregate_power_w: number;
  actual_power_w: number;
  predicted_power_w: number;
}

export interface NILMLabDemoRead {
  dataset: string;
  dataset_label: string;
  house_id: string;
  appliance: string;
  appliance_label: string;
  source_file: string;
  sample_count: number;
  on_threshold_w: number;
  sample_period_seconds: number;
  model_name: string;
  metrics: NILMLabMetricsRead;
  points: NILMLabPointRead[];
}

export interface NILMLabApplianceRead {
  id: string;
  label: string;
  on_threshold_w: number;
  nominal_power_w: number;
}

export interface NILMLabModelRead {
  id: string;
  label: string;
  task: string;
  input_signal: string;
  output_signal: string;
  status: string;
}

export interface NILMLabCatalogRead {
  default_dataset: string;
  default_house_id: string;
  default_appliance: string;
  datasets: Array<{ id: string; label: string; description: string }>;
  houses: Array<{ id: string; label: string }>;
  appliances: NILMLabApplianceRead[];
  models: NILMLabModelRead[];
}

export interface NILMLabDatasetFileRead {
  name: string;
  path: string;
  kind: string;
  size_bytes: number | null;
  is_symlink: boolean;
  storage_area: string;
}

export interface NILMLabDatasetInventoryItemRead {
  id: string;
  label: string;
  name: string;
  description: string;
  scope: string;
  houses: number;
  supported_houses: string[];
  appliances: string[];
  sample_period: string;
  estimated_scale: string;
  public_reference: string;
  official_url: string;
  license_access_notes: string;
  raw_path: string;
  processed_path: string;
  processed_sample_path: string | null;
  sample_path: string | null;
  status: string;
  raw_available: boolean;
  processed_available: boolean;
  processed_sample_available: boolean;
  processed_is_sample: boolean;
  sample_available: boolean;
  raw_file_count: number;
  raw_total_bytes: number | null;
  processed_file_count: number;
  processed_total_bytes: number | null;
  raw_files: NILMLabDatasetFileRead[];
  processed_files: NILMLabDatasetFileRead[];
  actions: string[];
  available_actions: string[];
  import_command: string;
  limitations: string[];
  safe_to_convert_locally: boolean;
}

export interface NILMLabDatasetsRead {
  datasets: NILMLabDatasetInventoryItemRead[];
  storage_note: string;
  ingestion_note: string;
}

export interface NILMLabDatasetColumnProfileRead {
  name: string;
  kind: string;
  non_empty_count: number;
  missing_count: number;
  min_value: number | null;
  max_value: number | null;
  mean_value: number | null;
}

export interface NILMLabDatasetStructureNodeRead {
  path: string;
  kind: string;
  shape: string | null;
  dtype: string | null;
}

export interface NILMLabDatasetFileProfileRead {
  name: string;
  path: string;
  kind: string;
  size_bytes: number | null;
  status: string;
  profiled_row_limit: number | null;
  profiled_row_count: number | null;
  truncated: boolean;
  row_count: number | null;
  column_count: number | null;
  columns: string[];
  detected_timestamp_column: string | null;
  detected_power_columns: string[];
  detected_current_columns: string[];
  detected_voltage_columns: string[];
  detected_appliance_columns: string[];
  preview_rows: Array<Record<string, string>>;
  column_profiles: NILMLabDatasetColumnProfileRead[];
  start_time: string | null;
  end_time: string | null;
  structure: NILMLabDatasetStructureNodeRead[];
  notes: string[];
}

export interface NILMLabDatasetProfileRead {
  dataset: string;
  dataset_label: string;
  raw_file_count: number;
  profiled_file_count: number;
  total_size_bytes: number | null;
  limits: Record<string, number | null>;
  files: NILMLabDatasetFileProfileRead[];
}

export interface NILMLabDatasetFilesRead {
  dataset: string;
  dataset_label: string;
  file_count: number;
  total_size_bytes: number | null;
  files: NILMLabDatasetFileRead[];
}

export interface NILMLabDatasetDownloadGuideRead {
  dataset: string;
  dataset_label: string;
  official_url: string;
  license_access_notes: string;
  raw_path: string;
  processed_path: string;
  sample_path: string | null;
  instructions: string[];
  import_command: string;
  limitations: string[];
}

export interface NILMLabDatasetConversionRead {
  dataset: string;
  dataset_label: string;
  runnable: boolean;
  executed: boolean;
  status: string;
  command: string;
  message: string;
}

export interface NILMLabReportRead {
  dataset: string;
  house_id: string;
  appliance: string;
  model_name: string;
  source_file: string;
  generated_at: string;
  markdown: string;
}

export interface NILMLabAnalysisRunRequest {
  dataset_id: string;
  house_id: string;
  appliance: string;
  analysis_type: string;
  model_name: string;
  max_samples: number;
  use_sample_if_full_dataset_missing: boolean;
}

export interface NILMLabSignalSummaryRead {
  sample_count: number;
  start_time: string | null;
  end_time: string | null;
  aggregate_min_w: number | null;
  aggregate_mean_w: number | null;
  aggregate_max_w: number | null;
  appliance_on_threshold_w: number;
}

export interface NILMLabDetectedColumnsRead {
  timestamp: string | null;
  power: string[];
  current: string[];
  voltage: string[];
  appliances: string[];
}

export interface NILMLabAnalysisEventRead {
  ts: string;
  event_type: string;
  step_magnitude_w: number;
  estimated_appliance: string;
  confidence: number;
  explanation: string;
}

export interface NILMLabAnalysisRunRead {
  run_id: UUID;
  status: string;
  dataset_id: string;
  dataset_label: string;
  house_id: string;
  appliance: string;
  appliance_label: string;
  analysis_type: string;
  model_name: string;
  source_file: string;
  signal_summary: NILMLabSignalSummaryRead;
  detected_columns: NILMLabDetectedColumnsRead;
  chart_data: NILMLabPointRead[];
  metrics: NILMLabMetricsRead;
  events: NILMLabAnalysisEventRead[];
  output: string;
  explanation: string;
  limitations: string[];
}

export interface NILMLabAIExplanationRead {
  run_id: UUID;
  enabled: boolean;
  provider: string;
  model: string | null;
  technical_summary: string;
  plain_language_explanation: string;
  limitations: string[];
  suggested_next_experiment: string;
}

export interface DemoSeedResponse {
  email: string;
  password: string;
  user_id: UUID;
  home_id: UUID;
  device_id: UUID;
  metric_count: number;
  anomaly_count: number;
}

export interface DemoLiveMetricResponse {
  published: boolean;
  topic: string;
  home_id: UUID;
  device_id: UUID;
  device_external_id: string;
  ts: string;
  active_power_w: number;
  voltage_v: number;
  current_a: number;
  energy_wh_delta: number;
  scenario: string;
}

export interface RealtimeMetricEvent {
  event: "metric_created";
  metric: EnergyMetricRead;
}

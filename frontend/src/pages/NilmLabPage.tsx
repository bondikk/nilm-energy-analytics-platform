import {
  Activity,
  BarChart3,
  Database,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  HardDrive,
  Microscope,
  RefreshCw,
  Target,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { NilmOverlayChart } from "../components/charts/NilmOverlayChart";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";
import { MetricCard } from "../components/ui/MetricCard";
import { StatusPill } from "../components/ui/StatusPill";
import {
  DEFAULT_NILM_OVERLAY_VISIBILITY,
  buildNilmChartPoints,
  summarizeNilmExperiment,
  type NilmOverlayVisibility,
} from "../features/nilm/nilmExperiment";
import { formatEnergyWh, formatMetric, formatWatts } from "../features/nilm/nilmFormat";
import { apiClient } from "../services/apiClient";
import type {
  NILMLabApplianceRead,
  NILMLabCatalogRead,
  NILMLabDatasetFileRead,
  NILMLabDatasetFileProfileRead,
  NILMLabDatasetInventoryItemRead,
  NILMLabDatasetProfileRead,
  NILMLabDatasetsRead,
  NILMLabDemoRead,
  NILMLabModelRead,
} from "../types/api";

type LabMode = "datasets" | "analysis" | "prediction";

const LAB_MODES: Array<{ id: LabMode; label: string; icon: ReactNode }> = [
  { id: "datasets", label: "Datasets", icon: <FolderOpen size={16} /> },
  { id: "analysis", label: "Analysis", icon: <BarChart3 size={16} /> },
  { id: "prediction", label: "Prediction", icon: <Activity size={16} /> },
];

export function NilmLabPage() {
  const [catalog, setCatalog] = useState<NILMLabCatalogRead | null>(null);
  const [datasetLibrary, setDatasetLibrary] = useState<NILMLabDatasetsRead | null>(null);
  const [demo, setDemo] = useState<NILMLabDemoRead | null>(null);
  const [dataset, setDataset] = useState("uk-dale");
  const [houseId, setHouseId] = useState("house-1");
  const [appliance, setAppliance] = useState("kettle");
  const [activeMode, setActiveMode] = useState<LabMode>("datasets");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [datasetProfile, setDatasetProfile] = useState<NILMLabDatasetProfileRead | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [visibility, setVisibility] = useState<NilmOverlayVisibility>(
    DEFAULT_NILM_OVERLAY_VISIBILITY,
  );

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const [nextCatalog, nextDatasetLibrary] = await Promise.all([
          apiClient.nilmCatalog(),
          apiClient.nilmDatasets(),
        ]);
        if (!cancelled) {
          setCatalog(nextCatalog);
          setDatasetLibrary(nextDatasetLibrary);
          setDataset(nextCatalog.default_dataset);
          setHouseId(nextCatalog.default_house_id);
          setAppliance(nextCatalog.default_appliance);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load NILM catalog");
          setLoading(false);
        }
      }
    }
    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDemo() {
      setLoading(true);
      setError("");
      try {
        const nextDemo = await apiClient.nilmDemo(dataset, houseId, appliance);
        if (!cancelled) {
          setDemo(nextDemo);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Unable to load NILM demo");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (catalog) {
      void loadDemo();
    }
    return () => {
      cancelled = true;
    };
  }, [appliance, catalog, dataset, houseId]);

  useEffect(() => {
    let cancelled = false;
    async function loadDatasetProfile() {
      setProfileLoading(true);
      setProfileError("");
      try {
        const nextProfile = await apiClient.nilmDatasetProfile(dataset, 6);
        if (!cancelled) {
          setDatasetProfile(nextProfile);
        }
      } catch (caught) {
        if (!cancelled) {
          setDatasetProfile(null);
          setProfileError(
            caught instanceof Error ? caught.message : "Unable to profile NILM dataset",
          );
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    if (activeMode === "analysis") {
      void loadDatasetProfile();
    }
    return () => {
      cancelled = true;
    };
  }, [activeMode, dataset]);

  const selectedDataset = datasetLibrary?.datasets.find((item) => item.id === dataset) ?? null;
  const selectedModel = catalog?.models[0] ?? null;
  const selectedAppliance = catalog?.appliances.find((item) => item.id === appliance) ?? null;
  const chartPoints = useMemo(() => buildNilmChartPoints(demo?.points ?? []), [demo]);
  const experimentSummary = useMemo(
    () => (demo ? summarizeNilmExperiment(demo) : null),
    [demo],
  );
  const maxAggregate = useMemo(
    () => Math.max(...(demo?.points.map((point) => point.aggregate_power_w) ?? [0])),
    [demo],
  );

  async function downloadReport() {
    setReportBusy(true);
    try {
      const report = await apiClient.nilmReport(dataset, houseId, appliance);
      const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nilm-${dataset}-${houseId}-${appliance}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setReportBusy(false);
    }
  }

  function toggleSeries(series: keyof NilmOverlayVisibility) {
    setVisibility((current) => ({
      ...current,
      [series]: !current[series],
    }));
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!catalog || loading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (!demo) {
    return (
      <EmptyState
        message="The backend did not return a NILM experiment for the selected combination."
        title="No NILM experiment"
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="nilm-header">
        <div>
          <span className="eyebrow">Dataset-backed research workspace</span>
          <h2>NILM Lab</h2>
          <p>
            Open public NILM datasets, inspect local files, check pipeline readiness, and compare
            appliance-level predictions against ground truth.
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={reportBusy}
          onClick={downloadReport}
          type="button"
        >
          <Download size={16} />
          {reportBusy ? "Preparing..." : "Report"}
        </button>
      </section>

      <section className="filter-grid">
        <label>
          Dataset
          <select value={dataset} onChange={(event) => setDataset(event.target.value)}>
            {catalog.datasets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          House
          <select value={houseId} onChange={(event) => setHouseId(event.target.value)}>
            {catalog.houses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Appliance
          <select value={appliance} onChange={(event) => setAppliance(event.target.value)}>
            {catalog.appliances.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="lab-tabs" aria-label="NILM Lab workflow">
        {LAB_MODES.map((mode) => (
          <button
            className={`lab-tab ${activeMode === mode.id ? "is-active" : ""}`}
            key={mode.id}
            type="button"
            onClick={() => setActiveMode(mode.id)}
          >
            {mode.icon}
            {mode.label}
          </button>
        ))}
      </section>

      {activeMode === "datasets" && datasetLibrary ? (
        <DatasetLibraryPanel
          datasets={datasetLibrary.datasets}
          ingestionNote={datasetLibrary.ingestion_note}
          selectedDataset={dataset}
          storageNote={datasetLibrary.storage_note}
          onSelectDataset={setDataset}
        />
      ) : null}

      {activeMode === "analysis" && selectedDataset ? (
        <DatasetAnalysisPanel
          appliance={selectedAppliance}
          dataset={selectedDataset}
          datasetProfile={datasetProfile?.dataset === dataset ? datasetProfile : null}
          demo={demo}
          houseId={houseId}
          profileError={profileError}
          profileLoading={profileLoading}
        />
      ) : null}

      {activeMode === "prediction" ? (
        <PredictionWorkspace
          chartPoints={chartPoints}
          demo={demo}
          experimentSummary={experimentSummary}
          maxAggregate={maxAggregate}
          selectedAppliance={selectedAppliance}
          selectedModel={selectedModel}
          visibility={visibility}
          onToggleSeries={toggleSeries}
        />
      ) : null}
    </div>
  );
}

function DatasetLibraryPanel({
  datasets,
  ingestionNote,
  selectedDataset,
  storageNote,
  onSelectDataset,
}: {
  datasets: NILMLabDatasetInventoryItemRead[];
  ingestionNote: string;
  selectedDataset: string;
  storageNote: string;
  onSelectDataset: (dataset: string) => void;
}) {
  const selected = datasets.find((dataset) => dataset.id === selectedDataset) ?? datasets[0];

  return (
    <section className="panel dataset-library">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Dataset explorer</span>
          <h2>NILM dataset library</h2>
        </div>
        <StatusPill>{datasets.length} datasets</StatusPill>
      </div>
      <p className="muted">{storageNote}</p>

      <div className="dataset-explorer-grid">
        <div className="dataset-picker-list" aria-label="Available NILM datasets">
          {datasets.map((dataset) => (
            <button
              className={`dataset-picker-card ${
                dataset.id === selectedDataset ? "is-selected" : ""
              }`}
              key={dataset.id}
              type="button"
              onClick={() => onSelectDataset(dataset.id)}
            >
              <span>
                <strong>{dataset.label}</strong>
                <small>{dataset.status}</small>
              </span>
              <DatasetReadiness dataset={dataset} />
            </button>
          ))}
        </div>

        <article className="dataset-detail-panel">
          <div className="dataset-detail-panel__heading">
            <div>
              <span className="eyebrow">{selected.status}</span>
              <h3>{selected.label}</h3>
            </div>
            <a
              className="button button--secondary"
              href={selected.public_reference}
              rel="noreferrer"
              target="_blank"
            >
              <FileText size={16} />
              Source
            </a>
          </div>
          <p>{selected.description}</p>

          <div className="dataset-summary-strip">
            <DatasetAvailability
              available={selected.raw_available}
              detail={`${selected.raw_file_count} files · ${formatBytes(selected.raw_total_bytes)}`}
              icon={<HardDrive size={15} />}
              label="Raw files"
              path={selected.raw_path}
            />
            <DatasetAvailability
              available={selected.processed_available}
              detail={`${selected.processed_file_count} files · ${formatBytes(
                selected.processed_total_bytes,
              )}`}
              icon={<Database size={15} />}
              label="Processed CSV"
              path={selected.processed_path}
            />
            <DatasetAvailability
              available={selected.sample_available}
              detail={selected.sample_available ? "usable in prediction demo" : undefined}
              icon={<Waves size={15} />}
              label="Sample"
              path={selected.sample_path ?? "No packaged sample"}
              state={selected.sample_available ? "ready" : "optional"}
              statusLabel={selected.sample_available ? "ready" : "optional"}
            />
          </div>

          <dl className="dataset-stats dataset-stats--wide">
            <div>
              <dt>Homes</dt>
              <dd>{selected.houses}</dd>
            </div>
            <div>
              <dt>Appliances</dt>
              <dd>{selected.appliances.join(", ")}</dd>
            </div>
            <div>
              <dt>Sampling</dt>
              <dd>{selected.sample_period}</dd>
            </div>
            <div>
              <dt>Scale</dt>
              <dd>{selected.estimated_scale}</dd>
            </div>
          </dl>

          <div className="dataset-file-grid">
            <DatasetFileTable
              emptyMessage="Raw files are not connected in data/raw yet."
              files={selected.raw_files}
              title="Raw file inventory"
            />
            <DatasetFileTable
              emptyMessage="No unified processed CSV has been generated yet."
              files={selected.processed_files}
              title="Processed file inventory"
            />
          </div>

          <div className="dataset-next-actions">
            <span className="eyebrow">Next analysis steps</span>
            <ol className="dataset-actions">
              {selected.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
        </article>
      </div>
      <p className="muted">{ingestionNote}</p>
    </section>
  );
}

function DatasetAnalysisPanel({
  appliance,
  dataset,
  datasetProfile,
  demo,
  houseId,
  profileError,
  profileLoading,
}: {
  appliance: NILMLabApplianceRead | null;
  dataset: NILMLabDatasetInventoryItemRead;
  datasetProfile: NILMLabDatasetProfileRead | null;
  demo: NILMLabDemoRead;
  houseId: string;
  profileError: string;
  profileLoading: boolean;
}) {
  const pipelineSteps: Array<{
    detail: string;
    label: string;
    state: "ready" | "missing" | "optional";
  }> = [
    {
      label: "Raw dataset connected",
      state: dataset.raw_available ? "ready" : "missing",
      detail: `${dataset.raw_file_count} files in ${dataset.raw_path}`,
    },
    {
      label: "Unified processed CSV",
      state: dataset.processed_available ? "ready" : "missing",
      detail: dataset.processed_available
        ? dataset.processed_path
        : "Convert raw data before full training/evaluation.",
    },
    {
      label: dataset.sample_available ? "Sample experiment available" : "Packaged sample",
      state: dataset.sample_available ? "ready" : "optional",
      detail: dataset.sample_path ?? "Not bundled for this dataset; raw analysis can still continue.",
    },
    {
      label: "Baseline prediction loaded",
      state: demo.sample_count > 0 ? "ready" : "missing",
      detail: `${demo.sample_count} samples for ${demo.appliance_label}`,
    },
  ];

  return (
    <>
      <section className="metric-grid">
        <MetricCard
          detail={`${dataset.raw_file_count} discovered files`}
          icon={<HardDrive size={18} />}
          label="Raw storage"
          tone={dataset.raw_available ? "green" : "amber"}
          value={formatBytes(dataset.raw_total_bytes)}
        />
        <MetricCard
          detail={dataset.processed_path}
          icon={<Database size={18} />}
          label="Processed schema"
          tone={dataset.processed_available ? "green" : "amber"}
          value={dataset.processed_available ? "Ready" : "Missing"}
        />
        <MetricCard
          detail={`${houseId.replace("-", " ")} · ${appliance?.label ?? demo.appliance_label}`}
          icon={<Microscope size={18} />}
          label="Experiment target"
          tone="blue"
          value={demo.dataset_label}
        />
        <MetricCard
          detail={`On threshold ${formatWatts(demo.on_threshold_w)}`}
          icon={<Target size={18} />}
          label="Baseline samples"
          value={String(demo.sample_count)}
        />
      </section>

      <section className="analysis-grid">
        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">Dataset analysis</span>
              <h2>{dataset.label} readiness</h2>
            </div>
            <DatasetReadiness dataset={dataset} />
          </div>
          <div className="pipeline-list">
            {pipelineSteps.map((step) => (
              <div className={`pipeline-step is-${step.state}`} key={step.label}>
                <span>{pipelineStatusLabel(step.state)}</span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel__heading">
            <div>
              <span className="eyebrow">What happens here</span>
              <h2>Analysis workflow</h2>
            </div>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Input signal</dt>
              <dd>Aggregate whole-home active power from the selected public NILM dataset.</dd>
            </div>
            <div>
              <dt>Ground truth</dt>
              <dd>Appliance-level channels such as kettle, fridge, washing machine, and dishwasher.</dd>
            </div>
            <div>
              <dt>Current method</dt>
              <dd>Baseline step-change disaggregation, evaluated with MAE, precision, recall, and F1.</dd>
            </div>
            <div>
              <dt>Next upgrade</dt>
              <dd>Convert larger houses to the unified CSV schema, then train ML and Seq2Point models.</dd>
            </div>
          </dl>
        </article>
      </section>

      <RawDatasetProfilePanel
        dataset={dataset}
        profile={datasetProfile}
        profileError={profileError}
        profileLoading={profileLoading}
      />
    </>
  );
}

function RawDatasetProfilePanel({
  dataset,
  profile,
  profileError,
  profileLoading,
}: {
  dataset: NILMLabDatasetInventoryItemRead;
  profile: NILMLabDatasetProfileRead | null;
  profileError: string;
  profileLoading: boolean;
}) {
  return (
    <section className="panel raw-profile-panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Raw dataset profile</span>
          <h2>{dataset.label} detailed analysis</h2>
        </div>
        <StatusPill tone={profile?.files.length ? "success" : undefined}>
          {profileLoading ? "profiling" : `${profile?.profiled_file_count ?? 0} files`}
        </StatusPill>
      </div>

      {profileLoading ? (
        <div className="dataset-empty-row">
          <RefreshCw size={16} />
          Profiling full raw files. Large CSV datasets can take a few seconds.
        </div>
      ) : null}

      {profileError ? <div className="dataset-empty-row">{profileError}</div> : null}

      {!profileLoading && !profileError && !profile?.files.length ? (
        <div className="dataset-empty-row">
          No raw files are available for profiling under {dataset.raw_path}.
        </div>
      ) : null}

      {profile ? (
        <div className="raw-profile-file-grid">
          {profile.files.map((file) => (
            <RawDatasetFileProfile key={file.path} file={file} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RawDatasetFileProfile({ file }: { file: NILMLabDatasetFileProfileRead }) {
  const previewColumns = file.preview_rows[0] ? Object.keys(file.preview_rows[0]) : [];

  return (
    <article className="raw-profile-file">
      <div className="dataset-detail-panel__heading">
        <div>
          <span className="eyebrow">{file.kind} · {file.status}</span>
          <h3>{file.name}</h3>
        </div>
        <StatusPill tone={file.status === "profiled" ? "success" : "warning"}>
          {formatBytes(file.size_bytes)}
        </StatusPill>
      </div>

      <dl className="dataset-stats dataset-stats--wide">
        <div>
          <dt>Rows</dt>
          <dd>{formatCount(file.row_count)}</dd>
        </div>
        <div>
          <dt>Columns</dt>
          <dd>{formatCount(file.column_count)}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{formatDateTime(file.start_time)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{formatDateTime(file.end_time)}</dd>
        </div>
      </dl>

      {file.columns.length ? (
        <div className="column-cloud" aria-label="Dataset columns">
          {file.columns.slice(0, 24).map((column) => (
            <span key={column}>{column}</span>
          ))}
        </div>
      ) : null}

      {file.column_profiles.length ? (
        <ProfileMetricTable profiles={file.column_profiles} />
      ) : null}

      {file.structure.length ? <HdfStructureTable nodes={file.structure} /> : null}

      {file.preview_rows.length ? (
        <PreviewRowsTable columns={previewColumns} rows={file.preview_rows} />
      ) : null}

      {file.notes.length ? (
        <div className="profile-notes">
          {file.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ProfileMetricTable({
  profiles,
}: {
  profiles: NILMLabDatasetFileProfileRead["column_profiles"];
}) {
  return (
    <div className="table-wrap">
      <table className="data-table data-table--compact">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Non-empty</th>
            <th>Missing</th>
            <th>Min</th>
            <th>Mean</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => (
            <tr key={profile.name}>
              <td>{profile.name}</td>
              <td>{formatCount(profile.non_empty_count)}</td>
              <td>{formatCount(profile.missing_count)}</td>
              <td>{formatNumber(profile.min_value)}</td>
              <td>{formatNumber(profile.mean_value)}</td>
              <td>{formatNumber(profile.max_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HdfStructureTable({
  nodes,
}: {
  nodes: NILMLabDatasetFileProfileRead["structure"];
}) {
  return (
    <div className="table-wrap">
      <table className="data-table data-table--compact">
        <thead>
          <tr>
            <th>HDF5 path</th>
            <th>Kind</th>
            <th>Shape</th>
            <th>Dtype</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.path}>
              <td>{node.path}</td>
              <td>{node.kind}</td>
              <td>{node.shape ?? "-"}</td>
              <td>{node.dtype ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewRowsTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Record<string, string>>;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table data-table--compact">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${Object.values(row).join("-")}`}>
              {columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionWorkspace({
  chartPoints,
  demo,
  experimentSummary,
  maxAggregate,
  selectedAppliance,
  selectedModel,
  visibility,
  onToggleSeries,
}: {
  chartPoints: ReturnType<typeof buildNilmChartPoints>;
  demo: NILMLabDemoRead;
  experimentSummary: ReturnType<typeof summarizeNilmExperiment> | null;
  maxAggregate: number;
  selectedAppliance: NILMLabApplianceRead | null;
  selectedModel: NILMLabModelRead | null;
  visibility: NilmOverlayVisibility;
  onToggleSeries: (series: keyof NilmOverlayVisibility) => void;
}) {
  return (
    <>
      <section className="metric-grid">
        <MetricCard
          detail="Mean absolute error"
          icon={<Target size={18} />}
          label="MAE"
          tone="green"
          value={`${formatMetric(demo.metrics.mae_w, 3)} W`}
        />
        <MetricCard
          detail="On/off classification"
          icon={<Microscope size={18} />}
          label="F1-score"
          tone="blue"
          value={formatMetric(demo.metrics.f1_score)}
        />
        <MetricCard
          detail={`${formatMetric(demo.metrics.precision)} precision`}
          label="Recall"
          tone="amber"
          value={formatMetric(demo.metrics.recall)}
        />
        <MetricCard
          detail={`${demo.sample_count} samples from ${demo.source_file}`}
          icon={<Waves size={18} />}
          label="Peak aggregate"
          value={formatWatts(maxAggregate)}
        />
      </section>

      {experimentSummary ? (
        <section className="metric-grid">
          <MetricCard
            detail="Largest point-level miss"
            icon={<Gauge size={18} />}
            label="Max error"
            tone="red"
            value={formatWatts(experimentSummary.maxAbsoluteErrorW)}
          />
          <MetricCard
            detail="Ground-truth on samples"
            icon={<Activity size={18} />}
            label="Actual active"
            tone="green"
            value={String(experimentSummary.activeGroundTruthSamples)}
          />
          <MetricCard
            detail="Predicted on samples"
            icon={<Activity size={18} />}
            label="Predicted active"
            tone="amber"
            value={String(experimentSummary.activePredictionSamples)}
          />
          <MetricCard
            detail={`Actual ${formatEnergyWh(experimentSummary.actualEnergyWh)}`}
            label="Energy error"
            value={formatEnergyWh(experimentSummary.energyErrorWh)}
          />
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">
              {demo.dataset_label} · {demo.house_id}
            </span>
            <h2>{demo.appliance_label} prediction overlay</h2>
          </div>
          <StatusPill tone="success">{demo.model_name}</StatusPill>
        </div>
        <div className="overlay-toolbar" aria-label="NILM overlay series">
          {[
            ["aggregate", "Aggregate"],
            ["actual", "Ground truth"],
            ["predicted", "Prediction"],
            ["error", "Absolute error"],
          ].map(([series, label]) => (
            <button
              className={`overlay-toggle ${
                visibility[series as keyof NilmOverlayVisibility] ? "is-active" : ""
              }`}
              key={series}
              type="button"
              onClick={() => onToggleSeries(series as keyof NilmOverlayVisibility)}
            >
              {label}
            </button>
          ))}
        </div>
        <NilmOverlayChart
          points={chartPoints}
          thresholdW={demo.on_threshold_w}
          visibility={visibility}
        />
      </section>

      <section className="model-grid">
        <article className="panel">
          <span className="eyebrow">Experiment source</span>
          <dl className="definition-list">
            <div>
              <dt>Source file</dt>
              <dd>{demo.source_file}</dd>
            </div>
            <div>
              <dt>Sample period</dt>
              <dd>{demo.sample_period_seconds} seconds</dd>
            </div>
            <div>
              <dt>On threshold</dt>
              <dd>{formatWatts(demo.on_threshold_w)}</dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <span className="eyebrow">Model card</span>
          <dl className="definition-list">
            <div>
              <dt>Task</dt>
              <dd>{selectedModel?.task ?? "single-appliance disaggregation"}</dd>
            </div>
            <div>
              <dt>Input</dt>
              <dd>{selectedModel?.input_signal ?? "aggregate active power window"}</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{selectedModel?.output_signal ?? "appliance active power"}</dd>
            </div>
            <div>
              <dt>Nominal appliance power</dt>
              <dd>{formatWatts(selectedAppliance?.nominal_power_w ?? 0)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="panel">
        <div className="panel__heading">
          <div>
            <span className="eyebrow">Sample-level audit</span>
            <h2>Prediction points</h2>
          </div>
          <StatusPill>{demo.sample_count} samples</StatusPill>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Aggregate</th>
                <th>Ground truth</th>
                <th>Prediction</th>
                <th>Abs. error</th>
              </tr>
            </thead>
            <tbody>
              {chartPoints.map((point) => (
                <tr key={point.ts}>
                  <td>{point.label}</td>
                  <td>{formatWatts(point.aggregate)}</td>
                  <td>{formatWatts(point.actual)}</td>
                  <td>{formatWatts(point.predicted)}</td>
                  <td>{formatWatts(point.absoluteError)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DatasetAvailability({
  available,
  detail,
  icon,
  label,
  path,
  state,
  statusLabel,
}: {
  available: boolean;
  detail?: string;
  icon: ReactNode;
  label: string;
  path: string;
  state?: "ready" | "missing" | "optional";
  statusLabel?: string;
}) {
  const resolvedState = state ?? (available ? "ready" : "missing");
  const resolvedStatusLabel = statusLabel ?? (available ? "ready" : "missing");
  const statusTone =
    resolvedState === "ready" ? "success" : resolvedState === "missing" ? "warning" : undefined;

  return (
    <div className="dataset-availability">
      <span className={`is-${resolvedState}`}>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{path}</small>
        {detail ? <small>{detail}</small> : null}
      </div>
      <StatusPill tone={statusTone}>{resolvedStatusLabel}</StatusPill>
    </div>
  );
}

function DatasetFileTable({
  emptyMessage,
  files,
  title,
}: {
  emptyMessage: string;
  files: NILMLabDatasetFileRead[];
  title: string;
}) {
  return (
    <div className="dataset-file-panel">
      <div className="dataset-file-panel__heading">
        <span className="eyebrow">{title}</span>
        <StatusPill>{files.length} shown</StatusPill>
      </div>
      {files.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Size</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.path}>
                  <td>{file.name}</td>
                  <td>{file.is_symlink ? `${file.kind} link` : file.kind}</td>
                  <td>{formatBytes(file.size_bytes)}</td>
                  <td>{file.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dataset-empty-row">{emptyMessage}</div>
      )}
    </div>
  );
}

function DatasetReadiness({ dataset }: { dataset: NILMLabDatasetInventoryItemRead }) {
  if (dataset.processed_available) {
    return <StatusPill tone="success">analysis ready</StatusPill>;
  }
  if (dataset.raw_available) {
    return <StatusPill tone="warning">raw connected</StatusPill>;
  }
  if (dataset.sample_available) {
    return <StatusPill>sample only</StatusPill>;
  }
  return <StatusPill tone="danger">missing raw</StatusPill>;
}

function pipelineStatusLabel(state: "ready" | "missing" | "optional") {
  if (state === "ready") {
    return "Ready";
  }
  if (state === "optional") {
    return "Optional";
  }
  return "Missing";
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "unknown";
  }
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unit = "B";
  for (const nextUnit of units) {
    size /= 1024;
    unit = nextUnit;
    if (size < 1024) {
      break;
    }
  }

  return `${size.toLocaleString(undefined, {
    maximumFractionDigits: size >= 10 ? 1 : 2,
  })} ${unit}`;
}

function formatCount(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString();
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 3,
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

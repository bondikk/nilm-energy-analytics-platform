import {
  Activity,
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
  NILMLabAIExplanationRead,
  NILMLabAnalysisRunRead,
  NILMLabCatalogRead,
  NILMLabDatasetConversionRead,
  NILMLabDatasetDownloadGuideRead,
  NILMLabDatasetFileRead,
  NILMLabDatasetFileProfileRead,
  NILMLabDatasetFilesRead,
  NILMLabDatasetInventoryItemRead,
  NILMLabDatasetProfileRead,
  NILMLabDatasetsRead,
  NILMLabDemoRead,
  NILMLabModelRead,
} from "../types/api";

type LabMode = "datasets" | "analysis" | "prediction";
type DatasetDetailTab = "overview" | "files" | "profile" | "quality" | "guide";

const LIVE_DATASET_PROFILE_INTERVAL_MS = 8000;

const DATASET_DETAIL_TABS: Array<{ id: DatasetDetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "files", label: "Files" },
  { id: "profile", label: "Profile" },
  { id: "quality", label: "Signal Quality" },
  { id: "guide", label: "Import Guide" },
];

export function NilmLabPage({ initialMode = "datasets" }: { initialMode?: LabMode }) {
  const [catalog, setCatalog] = useState<NILMLabCatalogRead | null>(null);
  const [datasetLibrary, setDatasetLibrary] = useState<NILMLabDatasetsRead | null>(null);
  const [demo, setDemo] = useState<NILMLabDemoRead | null>(null);
  const [dataset, setDataset] = useState("uk-dale");
  const [houseId, setHouseId] = useState("house-1");
  const [appliance, setAppliance] = useState("kettle");
  const [activeMode] = useState<LabMode>(initialMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [datasetProfile, setDatasetProfile] = useState<NILMLabDatasetProfileRead | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileUpdatedAt, setProfileUpdatedAt] = useState<string | null>(null);
  const [liveProfileEnabled, setLiveProfileEnabled] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisRun, setAnalysisRun] = useState<NILMLabAnalysisRunRead | null>(null);
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
          setProfileUpdatedAt(new Date().toISOString());
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
    const intervalId =
      activeMode === "analysis" && liveProfileEnabled
        ? window.setInterval(() => {
            void loadDatasetProfile();
          }, LIVE_DATASET_PROFILE_INTERVAL_MS)
        : null;
    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeMode, dataset, liveProfileEnabled]);

  const selectedDataset = datasetLibrary?.datasets.find((item) => item.id === dataset) ?? null;
  const selectedModel = catalog?.models[0] ?? null;
  const selectedAppliance = catalog?.appliances.find((item) => item.id === appliance) ?? null;
  const isDatasetRoute = initialMode === "datasets";
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

  async function runAnalysis() {
    setAnalysisBusy(true);
    setError("");
    try {
      setAnalysisRun(
        await apiClient.nilmRunAnalysis({
          dataset_id: dataset,
          house_id: houseId,
          appliance,
          analysis_type: "baseline_disaggregation",
          model_name: selectedModel?.id ?? "threshold_step_baseline",
          max_samples: 500,
          use_sample_if_full_dataset_missing: true,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to run NILM analysis");
    } finally {
      setAnalysisBusy(false);
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

      {isDatasetRoute && datasetLibrary ? (
        <DatasetLibraryPanel
          datasets={datasetLibrary.datasets}
          ingestionNote={datasetLibrary.ingestion_note}
          selectedDataset={dataset}
          storageNote={datasetLibrary.storage_note}
          onSelectDataset={setDataset}
        />
      ) : null}

      {!isDatasetRoute && selectedDataset ? (
        <DatasetAnalysisPanel
          appliance={selectedAppliance}
          analysisBusy={analysisBusy}
          analysisRun={analysisRun}
          dataset={selectedDataset}
          datasetProfile={datasetProfile?.dataset === dataset ? datasetProfile : null}
          demo={demo}
          houseId={houseId}
          profileError={profileError}
          profileLoading={profileLoading}
          profileUpdatedAt={profileUpdatedAt}
          liveProfileEnabled={liveProfileEnabled}
          onRunAnalysis={runAnalysis}
          onToggleLiveProfile={() => setLiveProfileEnabled((current) => !current)}
        />
      ) : null}

      {!isDatasetRoute ? (
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
  const [filesResponse, setFilesResponse] = useState<NILMLabDatasetFilesRead | null>(null);
  const [guide, setGuide] = useState<NILMLabDatasetDownloadGuideRead | null>(null);
  const [conversion, setConversion] = useState<NILMLabDatasetConversionRead | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<NILMLabDatasetFileProfileRead | null>(
    null,
  );
  const [activeDatasetTab, setActiveDatasetTab] = useState<DatasetDetailTab>("overview");
  const [actionBusy, setActionBusy] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    setFilesResponse(null);
    setGuide(null);
    setConversion(null);
    setSelectedProfile(null);
    setActiveDatasetTab("overview");
    setActionError("");
  }, [selectedDataset]);

  async function openFiles() {
    setActiveDatasetTab("files");
    setActionBusy("files");
    setActionError("");
    try {
      setFilesResponse(await apiClient.nilmDatasetFiles(selected.id));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to load dataset files");
    } finally {
      setActionBusy("");
    }
  }

  async function openGuide() {
    setActiveDatasetTab("guide");
    setActionBusy("guide");
    setActionError("");
    try {
      setGuide(await apiClient.nilmDatasetDownloadGuide(selected.id));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to load import guide");
    } finally {
      setActionBusy("");
    }
  }

  async function profileFile(path: string) {
    setActiveDatasetTab("profile");
    setActionBusy(path);
    setActionError("");
    try {
      const profile = await apiClient.nilmDatasetProfile(selected.id, 1, path);
      setSelectedProfile(profile.files[0] ?? null);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Unable to profile dataset file");
    } finally {
      setActionBusy("");
    }
  }

  async function requestConversionCommand() {
    setActiveDatasetTab("guide");
    setActionBusy("convert");
    setActionError("");
    try {
      setConversion(await apiClient.nilmDatasetConvert(selected.id));
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "Unable to prepare conversion command",
      );
    } finally {
      setActionBusy("");
    }
  }

  async function runPrimaryAction() {
    if (selected.sample_available && selected.sample_path) {
      await profileFile(selected.sample_path);
      return;
    }
    if (selected.raw_available || selected.processed_available) {
      await openFiles();
      return;
    }
    await openGuide();
  }

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
          <DatasetStatusBadges dataset={selected} />

          <div className="dataset-detail-tabs" aria-label="Dataset detail views">
            {DATASET_DETAIL_TABS.map((tab) => (
              <button
                className={activeDatasetTab === tab.id ? "is-active" : ""}
                key={tab.id}
                onClick={() => setActiveDatasetTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeDatasetTab === "overview" ? (
            <>
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
                  )}${selected.processed_is_sample ? " · sample" : ""}`}
                  icon={<Database size={15} />}
                  label="Processed CSV"
                  path={
                    selected.processed_is_sample
                      ? selected.processed_sample_path ?? selected.processed_path
                      : selected.processed_path
                  }
                  statusLabel={selected.processed_is_sample ? "sample ready" : undefined}
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

              <dl className="definition-list">
                <div>
                  <dt>Access notes</dt>
                  <dd>{selected.license_access_notes}</dd>
                </div>
                <div>
                  <dt>Conversion command</dt>
                  <dd>{selected.import_command}</dd>
                </div>
              </dl>

              <div className="dataset-next-actions">
                <span className="eyebrow">Next analysis steps</span>
                <ol className="dataset-actions">
                  {selected.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>
              </div>
            </>
          ) : null}

          {activeDatasetTab === "files" ? (
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
          ) : null}

          <div className="dataset-action-row">
            <button
              className="button button--primary"
              disabled={actionBusy !== ""}
              onClick={runPrimaryAction}
              type="button"
            >
              <FolderOpen size={16} />
              {primaryDatasetActionLabel(selected)}
            </button>
            <button
              className="button button--secondary"
              disabled={actionBusy !== ""}
              onClick={openFiles}
              type="button"
            >
              <Database size={16} />
              View files
            </button>
            <button
              className="button button--secondary"
              disabled={actionBusy !== ""}
              onClick={openGuide}
              type="button"
            >
              <FileText size={16} />
              Import guide
            </button>
            <button
              className="button button--secondary"
              disabled={actionBusy !== ""}
              onClick={requestConversionCommand}
              type="button"
            >
              <RefreshCw size={16} />
              Conversion command
            </button>
          </div>

          {actionError ? <div className="dataset-empty-row">{actionError}</div> : null}
          {actionBusy ? (
            <div className="dataset-empty-row">
              <RefreshCw size={16} />
              Loading dataset details
            </div>
          ) : null}

          {activeDatasetTab === "files" && filesResponse ? (
            <DatasetFileBrowserPanel
              filesResponse={filesResponse}
              busyKey={actionBusy}
              selectedProfilePath={selectedProfile?.path ?? null}
              onProfileFile={profileFile}
            />
          ) : null}

          {activeDatasetTab === "profile" && selectedProfile ? (
            <section className="dataset-profile-focus">
              <span className="eyebrow">Selected file profile</span>
              <RawDatasetFileProfile file={selectedProfile} />
            </section>
          ) : null}

          {activeDatasetTab === "profile" && !selectedProfile ? (
            <div className="dataset-empty-row">
              Select a profileable CSV/HDF5 file from Files, or use the primary action to profile
              the packaged sample.
            </div>
          ) : null}

          {activeDatasetTab === "quality" ? (
            <DatasetSignalQualityPanel dataset={selected} profile={selectedProfile} />
          ) : null}

          {activeDatasetTab === "guide" && guide ? <DatasetGuidePanel guide={guide} /> : null}

          {activeDatasetTab === "guide" && conversion ? (
            <DatasetConversionPanel conversion={conversion} />
          ) : null}

          {activeDatasetTab === "guide" && !guide && !conversion ? (
            <div className="dataset-empty-row">Open the import guide or conversion command for this dataset.</div>
          ) : null}
        </article>
      </div>
      <p className="muted">{ingestionNote}</p>
    </section>
  );
}

function DatasetStatusBadges({ dataset }: { dataset: NILMLabDatasetInventoryItemRead }) {
  const statuses = [
    {
      label: dataset.sample_available ? "sample ready" : "sample missing",
      tone: dataset.sample_available ? "success" : undefined,
    },
    {
      label: dataset.raw_available ? "raw ready" : "raw missing",
      tone: dataset.raw_available ? "success" : "warning",
    },
    {
      label: dataset.processed_available
        ? dataset.processed_is_sample
          ? "processed sample ready"
          : "processed ready"
        : "needs conversion",
      tone: dataset.processed_available ? "success" : "warning",
    },
  ] as const;

  return (
    <div className="dataset-status-badges" aria-label="Dataset local status">
      {statuses.map((status) => (
        <StatusPill key={status.label} tone={status.tone}>
          {status.label}
        </StatusPill>
      ))}
    </div>
  );
}

function DatasetSignalQualityPanel({
  dataset,
  profile,
}: {
  dataset: NILMLabDatasetInventoryItemRead;
  profile: NILMLabDatasetFileProfileRead | null;
}) {
  const quality = buildDatasetSignalQuality(profile);

  return (
    <section className="dataset-guide-panel">
      <div className="dataset-file-panel__heading">
        <div>
          <span className="eyebrow">Signal quality analysis</span>
          <h3>{profile?.name ?? dataset.label}</h3>
        </div>
        <StatusPill tone={quality.score >= 75 ? "success" : quality.score >= 45 ? "warning" : "danger"}>
          {quality.score}/100
        </StatusPill>
      </div>
      {!profile ? (
        <p className="muted">
          Profile a CSV or HDF5 file first. The quality panel will then estimate sampling period,
          missing values, power range, spikes, flatline risk, and basic validity ratios.
        </p>
      ) : null}
      <dl className="dataset-stats dataset-stats--wide">
        <div>
          <dt>Samples</dt>
          <dd>{formatCount(quality.sampleCount)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{quality.duration}</dd>
        </div>
        <div>
          <dt>Sampling period</dt>
          <dd>{quality.samplingPeriod}</dd>
        </div>
        <div>
          <dt>Missing values</dt>
          <dd>{formatCount(quality.missingValues)}</dd>
        </div>
        <div>
          <dt>Power range</dt>
          <dd>{quality.powerRange}</dd>
        </div>
        <div>
          <dt>Power mean</dt>
          <dd>{quality.powerMean}</dd>
        </div>
        <div>
          <dt>Zero ratio</dt>
          <dd>{quality.zeroRatio}</dd>
        </div>
        <div>
          <dt>Negative ratio</dt>
          <dd>{quality.negativeRatio}</dd>
        </div>
      </dl>
      <div className="profile-notes">
        {quality.flags.map((flag) => (
          <p key={flag}>{flag}</p>
        ))}
      </div>
    </section>
  );
}

function buildDatasetSignalQuality(profile: NILMLabDatasetFileProfileRead | null) {
  if (!profile) {
    return {
      duration: "-",
      flags: ["No file profile selected yet."],
      missingValues: null,
      negativeRatio: "-",
      powerMean: "-",
      powerRange: "-",
      sampleCount: null,
      samplingPeriod: "-",
      score: 0,
      zeroRatio: "-",
    };
  }

  const powerProfile =
    profile.column_profiles.find((column) =>
      profile.detected_power_columns.includes(column.name),
    ) ?? profile.column_profiles.find((column) => column.kind === "numeric");
  const sampleCount = profile.profiled_row_count ?? profile.row_count;
  const durationSeconds =
    profile.start_time && profile.end_time
      ? Math.max(0, (new Date(profile.end_time).getTime() - new Date(profile.start_time).getTime()) / 1000)
      : null;
  const samplingPeriod =
    durationSeconds !== null && sampleCount && sampleCount > 1
      ? `${(durationSeconds / (sampleCount - 1)).toFixed(2)} s`
      : "-";
  const missingValues = profile.column_profiles.reduce(
    (total, column) => total + column.missing_count,
    0,
  );
  const missingRatio = sampleCount ? missingValues / Math.max(sampleCount * Math.max(profile.column_count ?? 1, 1), 1) : 0;
  const flags = [
    profile.truncated ? "Profile is truncated; use full processing for final metrics." : "Profile covers the selected file window.",
    profile.detected_timestamp_column ? "Timestamp column detected." : "Timestamp column was not detected.",
    profile.detected_power_columns.length ? "Power signal columns detected." : "No obvious power column detected.",
  ];
  if (missingRatio > 0.05) {
    flags.push("Missing-value ratio is high enough to review before experiments.");
  }
  if (powerProfile?.min_value !== null && powerProfile?.min_value !== undefined && powerProfile.min_value < 0) {
    flags.push("Negative power values were detected; check sensor conventions or preprocessing.");
  }
  if (
    powerProfile?.min_value !== null &&
    powerProfile?.max_value !== null &&
    powerProfile?.min_value !== undefined &&
    powerProfile?.max_value !== undefined &&
    Math.abs(powerProfile.max_value - powerProfile.min_value) < 1
  ) {
    flags.push("Power signal appears nearly flat in the profiled window.");
  }
  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        (profile.detected_timestamp_column ? 0 : 25) -
        (profile.detected_power_columns.length ? 0 : 30) -
        Math.round(missingRatio * 100) -
        (profile.truncated ? 5 : 0),
    ),
  );

  return {
    duration: durationSeconds === null ? "-" : formatDuration(durationSeconds),
    flags,
    missingValues,
    negativeRatio:
      powerProfile?.min_value !== null && powerProfile?.min_value !== undefined && powerProfile.min_value < 0
        ? "detected"
        : "not detected",
    powerMean:
      powerProfile?.mean_value === null || powerProfile?.mean_value === undefined
        ? "-"
        : formatWatts(powerProfile.mean_value),
    powerRange:
      powerProfile?.min_value === null ||
      powerProfile?.max_value === null ||
      powerProfile?.min_value === undefined ||
      powerProfile?.max_value === undefined
        ? "-"
        : `${formatWatts(powerProfile.min_value)} - ${formatWatts(powerProfile.max_value)}`,
    sampleCount,
    samplingPeriod,
    score,
    zeroRatio: powerProfile?.min_value === 0 ? "zero values present" : "not detected",
  };
}

function DatasetFileBrowserPanel({
  busyKey,
  filesResponse,
  selectedProfilePath,
  onProfileFile,
}: {
  busyKey: string;
  filesResponse: NILMLabDatasetFilesRead;
  selectedProfilePath: string | null;
  onProfileFile: (path: string) => void;
}) {
  return (
    <section className="dataset-browser-panel">
      <div className="dataset-file-panel__heading">
        <div>
          <span className="eyebrow">Dataset file browser</span>
          <h3>{filesResponse.dataset_label} files</h3>
        </div>
        <StatusPill>
          {filesResponse.file_count} files · {formatBytes(filesResponse.total_size_bytes)}
        </StatusPill>
      </div>
      {filesResponse.files.length ? (
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>File</th>
                <th>Area</th>
                <th>Type</th>
                <th>Size</th>
                <th>Profile status</th>
                <th>Path</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {filesResponse.files.map((file) => {
                const profileable = isProfileableDatasetFile(file);
                return (
                  <tr key={file.path}>
                    <td>{file.name}</td>
                    <td>{file.storage_area}</td>
                    <td>{file.is_symlink ? `${file.kind} link` : file.kind}</td>
                    <td>{formatBytes(file.size_bytes)}</td>
                    <td>{profileable ? "profileable" : "unsupported"}</td>
                    <td>{file.path}</td>
                    <td>
                      <button
                        className="table-icon-button"
                        disabled={!profileable || busyKey !== ""}
                        onClick={() => onProfileFile(file.path)}
                        title={profileable ? "Profile file" : "No profiler for this file type"}
                        type="button"
                      >
                        {busyKey === file.path || selectedProfilePath === file.path ? (
                          <RefreshCw size={15} />
                        ) : (
                          <FileText size={15} />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dataset-empty-row">No local files are available for this dataset.</div>
      )}
    </section>
  );
}

function DatasetGuidePanel({ guide }: { guide: NILMLabDatasetDownloadGuideRead }) {
  return (
    <section className="dataset-guide-panel">
      <div className="dataset-file-panel__heading">
        <div>
          <span className="eyebrow">Import guide</span>
          <h3>{guide.dataset_label}</h3>
        </div>
        <a className="button button--secondary" href={guide.official_url} rel="noreferrer" target="_blank">
          <FileText size={16} />
          Official source
        </a>
      </div>
      <p>{guide.license_access_notes}</p>
      <ol className="dataset-actions">
        {guide.instructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ol>
      <dl className="definition-list">
        <div>
          <dt>Raw path</dt>
          <dd>{guide.raw_path}</dd>
        </div>
        <div>
          <dt>Processed path</dt>
          <dd>{guide.processed_path}</dd>
        </div>
        <div>
          <dt>Command</dt>
          <dd>{guide.import_command}</dd>
        </div>
      </dl>
      <div className="profile-notes">
        {guide.limitations.map((limitation) => (
          <p key={limitation}>{limitation}</p>
        ))}
      </div>
    </section>
  );
}

function DatasetConversionPanel({
  conversion,
}: {
  conversion: NILMLabDatasetConversionRead;
}) {
  return (
    <section className="dataset-guide-panel">
      <div className="dataset-file-panel__heading">
        <div>
          <span className="eyebrow">Conversion</span>
          <h3>{conversion.dataset_label}</h3>
        </div>
        <StatusPill tone={conversion.runnable ? "success" : "warning"}>
          {conversion.status}
        </StatusPill>
      </div>
      <p>{conversion.message}</p>
      <pre className="command-snippet">{conversion.command}</pre>
    </section>
  );
}

function DatasetAnalysisPanel({
  appliance,
  analysisBusy,
  analysisRun,
  dataset,
  datasetProfile,
  demo,
  houseId,
  liveProfileEnabled,
  profileError,
  profileLoading,
  profileUpdatedAt,
  onToggleLiveProfile,
  onRunAnalysis,
}: {
  appliance: NILMLabApplianceRead | null;
  analysisBusy: boolean;
  analysisRun: NILMLabAnalysisRunRead | null;
  dataset: NILMLabDatasetInventoryItemRead;
  datasetProfile: NILMLabDatasetProfileRead | null;
  demo: NILMLabDemoRead;
  houseId: string;
  liveProfileEnabled: boolean;
  profileError: string;
  profileLoading: boolean;
  profileUpdatedAt: string | null;
  onRunAnalysis: () => void;
  onToggleLiveProfile: () => void;
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
        ? dataset.processed_is_sample
          ? `${dataset.processed_sample_path ?? dataset.processed_path} (sample)`
          : dataset.processed_path
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
          value={
            dataset.processed_available
              ? dataset.processed_is_sample
                ? "Sample ready"
                : "Ready"
              : "Missing"
          }
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
            <button className="button" disabled={analysisBusy} onClick={onRunAnalysis} type="button">
              <Activity size={16} />
              {analysisBusy ? "Running..." : "Run analysis"}
            </button>
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

      {analysisRun ? <AnalysisRunResult run={analysisRun} /> : null}

      <RawDatasetProfilePanel
        dataset={dataset}
        liveProfileEnabled={liveProfileEnabled}
        profile={datasetProfile}
        profileError={profileError}
        profileLoading={profileLoading}
        profileUpdatedAt={profileUpdatedAt}
        onToggleLiveProfile={onToggleLiveProfile}
      />
    </>
  );
}

function AnalysisRunResult({ run }: { run: NILMLabAnalysisRunRead }) {
  const [explanation, setExplanation] = useState<NILMLabAIExplanationRead | null>(null);
  const [explanationBusy, setExplanationBusy] = useState(false);
  const [explanationError, setExplanationError] = useState("");

  async function generateExplanation() {
    setExplanationBusy(true);
    setExplanationError("");
    try {
      setExplanation(
        await apiClient.nilmExplainAnalysis(run.run_id, {
          appliance: run.appliance,
          appliance_label: run.appliance_label,
          dataset_id: run.dataset_id,
          dataset_label: run.dataset_label,
          event_count: run.events.length,
          f1_score: run.metrics.f1_score,
          mae_w: run.metrics.mae_w,
          model_name: run.model_name,
          rmse_w: run.metrics.rmse_w,
          sample_count: run.signal_summary.sample_count,
        }),
      );
    } catch (caught) {
      setExplanationError(
        caught instanceof Error ? caught.message : "Unable to generate explanation",
      );
    } finally {
      setExplanationBusy(false);
    }
  }

  function exportJsonReport() {
    const blob = new Blob([JSON.stringify(run, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nilm-${run.dataset_id}-${run.house_id}-${run.appliance}-${run.run_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Run result</span>
          <h2>{run.dataset_label} baseline analysis</h2>
          <p>{run.explanation}</p>
        </div>
        <div className="dataset-live-controls">
          <StatusPill tone="success">{run.status}</StatusPill>
          <button
            className="button button--secondary"
            disabled={explanationBusy}
            onClick={generateExplanation}
            type="button"
          >
            <FileText size={16} />
            {explanationBusy ? "Generating..." : "Generate explanation"}
          </button>
          <button className="button button--secondary" onClick={exportJsonReport} type="button">
            <Download size={16} />
            JSON report
          </button>
        </div>
      </div>

      <section className="metric-grid">
        <MetricCard
          detail={`${formatDateTime(run.signal_summary.start_time)} - ${formatDateTime(run.signal_summary.end_time)}`}
          icon={<Waves size={18} />}
          label="Signal window"
          tone="blue"
          value={String(run.signal_summary.sample_count)}
        />
        <MetricCard
          detail={`Mean ${formatWatts(run.signal_summary.aggregate_mean_w ?? 0)}`}
          icon={<Gauge size={18} />}
          label="Aggregate range"
          value={`${formatWatts(run.signal_summary.aggregate_min_w ?? 0)} - ${formatWatts(run.signal_summary.aggregate_max_w ?? 0)}`}
        />
        <MetricCard
          detail={`${run.detected_columns.appliances.length} appliance channels`}
          icon={<Database size={18} />}
          label="Detected columns"
          tone="green"
          value={run.detected_columns.timestamp ?? "timestamp missing"}
        />
        <MetricCard
          detail={`${formatMetric(run.metrics.precision)} precision`}
          icon={<Target size={18} />}
          label="F1 score"
          tone="green"
          value={formatMetric(run.metrics.f1_score)}
        />
      </section>

      <div className="analysis-grid">
        <article className="dataset-detail-panel">
          <div className="dataset-detail-panel__heading">
            <div>
              <span className="eyebrow">Events</span>
              <h3>Detected load steps</h3>
            </div>
            <StatusPill>{run.events.length} events</StatusPill>
          </div>
          <div className="event-list">
            {run.events.slice(0, 5).map((event) => (
              <article className="event-row" key={`${event.ts}-${event.step_magnitude_w}`}>
                <div className="event-row__icon">
                  <Activity size={17} />
                </div>
                <div>
                  <strong>
                    {event.event_type.replace("_", " ")} · {event.estimated_appliance}
                  </strong>
                  <span>{event.explanation}</span>
                </div>
                <StatusPill>{formatWatts(event.step_magnitude_w)}</StatusPill>
              </article>
            ))}
          </div>
        </article>

        <article className="dataset-detail-panel">
          <div className="dataset-detail-panel__heading">
            <div>
              <span className="eyebrow">Limitations</span>
              <h3>Interpretation guardrails</h3>
            </div>
          </div>
          <div className="profile-notes">
            {run.limitations.map((limitation) => (
              <p key={limitation}>{limitation}</p>
            ))}
          </div>
        </article>
      </div>

      {explanationError ? <div className="dataset-empty-row">{explanationError}</div> : null}

      {explanation ? (
        <article className="dataset-guide-panel">
          <div className="dataset-file-panel__heading">
            <div>
              <span className="eyebrow">AI-assisted explanation</span>
              <h3>{explanation.enabled ? "Generated interpretation" : "Local fallback interpretation"}</h3>
            </div>
            <StatusPill>{explanation.provider}</StatusPill>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Technical summary</dt>
              <dd>{explanation.technical_summary}</dd>
            </div>
            <div>
              <dt>Plain-language explanation</dt>
              <dd>{explanation.plain_language_explanation}</dd>
            </div>
            <div>
              <dt>Suggested next experiment</dt>
              <dd>{explanation.suggested_next_experiment}</dd>
            </div>
          </dl>
          <div className="profile-notes">
            {explanation.limitations.map((limitation) => (
              <p key={limitation}>{limitation}</p>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}

function RawDatasetProfilePanel({
  dataset,
  liveProfileEnabled,
  profile,
  profileError,
  profileLoading,
  profileUpdatedAt,
  onToggleLiveProfile,
}: {
  dataset: NILMLabDatasetInventoryItemRead;
  liveProfileEnabled: boolean;
  profile: NILMLabDatasetProfileRead | null;
  profileError: string;
  profileLoading: boolean;
  profileUpdatedAt: string | null;
  onToggleLiveProfile: () => void;
}) {
  return (
    <section className="panel raw-profile-panel">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Live dataset analysis</span>
          <h2>{dataset.label} realtime profile</h2>
          <p>
            {profileUpdatedAt
              ? `Last refreshed ${formatDateTime(profileUpdatedAt)}`
              : "Waiting for the first profiling response."}
          </p>
        </div>
        <div className="dataset-live-controls">
          <StatusPill tone={liveProfileEnabled ? "success" : undefined}>
            {liveProfileEnabled ? "live" : "paused"}
          </StatusPill>
          <StatusPill tone={profile?.files.length ? "success" : undefined}>
            {profileLoading ? "profiling" : `${profile?.profiled_file_count ?? 0} files`}
          </StatusPill>
          <button className="button button--secondary" onClick={onToggleLiveProfile} type="button">
            <RefreshCw size={16} />
            {liveProfileEnabled ? "Pause" : "Resume"}
          </button>
        </div>
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
          No raw or processed CSV files are available for profiling under {dataset.raw_path}.
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

      <DetectedSignalSummary file={file} />

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

function DetectedSignalSummary({ file }: { file: NILMLabDatasetFileProfileRead }) {
  const summary = [
    ["Timestamp", file.detected_timestamp_column ?? "-"],
    ["Power", formatColumnList(file.detected_power_columns)],
    ["Current", formatColumnList(file.detected_current_columns)],
    ["Voltage", formatColumnList(file.detected_voltage_columns)],
    ["Appliances", formatColumnList(file.detected_appliance_columns)],
    [
      "Profiled rows",
      file.profiled_row_count === null
        ? "-"
        : `${formatCount(file.profiled_row_count)}${
            file.truncated ? ` of ${formatCount(file.row_count)}` : ""
          }`,
    ],
  ];

  return (
    <dl className="detected-signal-grid">
      {summary.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
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
              <dt>Aggregate power</dt>
              <dd>Whole-home active power from the selected dataset sample.</dd>
            </div>
            <div>
              <dt>Ground truth</dt>
              <dd>Measured appliance channel used as the evaluation target.</dd>
            </div>
            <div>
              <dt>Output</dt>
              <dd>{selectedModel?.output_signal ?? "appliance active power"} baseline prediction.</dd>
            </div>
            <div>
              <dt>Absolute error</dt>
              <dd>Point-level difference between ground truth and baseline prediction.</dd>
            </div>
            <div>
              <dt>Nominal appliance power</dt>
              <dd>{formatWatts(selectedAppliance?.nominal_power_w ?? 0)}</dd>
            </div>
            <div>
              <dt>Limitations</dt>
              <dd>Rule-based step detection on a small sample; not production NILM inference.</dd>
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
    return (
      <StatusPill tone="success">
        {dataset.processed_is_sample ? "sample analysis ready" : "analysis ready"}
      </StatusPill>
    );
  }
  if (dataset.raw_available) {
    return <StatusPill tone="warning">raw connected</StatusPill>;
  }
  if (dataset.sample_available) {
    return <StatusPill>sample only</StatusPill>;
  }
  return <StatusPill tone="danger">missing raw</StatusPill>;
}

function primaryDatasetActionLabel(dataset: NILMLabDatasetInventoryItemRead) {
  if (dataset.sample_available && dataset.sample_path) {
    return "Open sample";
  }
  if (dataset.raw_available || dataset.processed_available) {
    return "View files";
  }
  return "Import guide";
}

function isProfileableDatasetFile(file: NILMLabDatasetFileRead) {
  return ["csv", "h5", "hdf5"].includes(file.kind.toLowerCase());
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

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)} min`;
  }
  return `${(seconds / 3600).toFixed(2)} h`;
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 3,
  });
}

function formatColumnList(columns: string[]) {
  if (!columns.length) {
    return "-";
  }
  return columns.slice(0, 5).join(", ") + (columns.length > 5 ? ` +${columns.length - 5}` : "");
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

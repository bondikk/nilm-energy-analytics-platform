import {
  Activity,
  Database,
  Download,
  Gauge,
  HardDrive,
  Microscope,
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
  NILMLabCatalogRead,
  NILMLabDatasetInventoryItemRead,
  NILMLabDatasetsRead,
  NILMLabDemoRead,
} from "../types/api";

export function NilmLabPage() {
  const [catalog, setCatalog] = useState<NILMLabCatalogRead | null>(null);
  const [datasetLibrary, setDatasetLibrary] = useState<NILMLabDatasetsRead | null>(null);
  const [demo, setDemo] = useState<NILMLabDemoRead | null>(null);
  const [dataset, setDataset] = useState("uk-dale");
  const [houseId, setHouseId] = useState("house-1");
  const [appliance, setAppliance] = useState("kettle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  const selectedModel = catalog?.models[0];
  const selectedAppliance = catalog?.appliances.find((item) => item.id === appliance);
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
          <span className="eyebrow">Sequence-to-point baseline surface</span>
          <h2>NILM prediction overlay lab</h2>
          <p>
            Compare aggregate power, appliance ground truth, and baseline prediction from the
            unified NILM sample.
          </p>
        </div>
        <button className="button button--secondary" disabled={reportBusy} onClick={downloadReport} type="button">
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

      {datasetLibrary ? (
        <DatasetLibraryPanel
          datasets={datasetLibrary.datasets}
          ingestionNote={datasetLibrary.ingestion_note}
          selectedDataset={dataset}
          storageNote={datasetLibrary.storage_note}
          onSelectDataset={setDataset}
        />
      ) : null}

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
            <span className="eyebrow">{demo.dataset_label} · {demo.house_id}</span>
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
              onClick={() => toggleSeries(series as keyof NilmOverlayVisibility)}
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
  return (
    <section className="panel dataset-library">
      <div className="panel__heading">
        <div>
          <span className="eyebrow">Dataset layer</span>
          <h2>NILM dataset library</h2>
        </div>
        <StatusPill>{datasets.length} datasets</StatusPill>
      </div>
      <p className="muted">{storageNote}</p>
      <div className="dataset-grid">
        {datasets.map((dataset) => (
          <article
            className={`dataset-card ${dataset.id === selectedDataset ? "is-selected" : ""}`}
            key={dataset.id}
          >
            <div className="dataset-card__heading">
              <div>
                <span className="eyebrow">{dataset.status}</span>
                <h3>{dataset.label}</h3>
              </div>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onSelectDataset(dataset.id)}
              >
                Use
              </button>
            </div>
            <p>{dataset.description}</p>
            <dl className="dataset-stats">
              <div>
                <dt>Homes</dt>
                <dd>{dataset.houses}</dd>
              </div>
              <div>
                <dt>Appliances</dt>
                <dd>{dataset.appliances.length}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{dataset.sample_period}</dd>
              </div>
            </dl>
            <div className="dataset-paths">
              <DatasetAvailability
                available={dataset.raw_available}
                icon={<HardDrive size={15} />}
                label="Raw"
                path={dataset.raw_path}
              />
              <DatasetAvailability
                available={dataset.processed_available}
                icon={<Database size={15} />}
                label="Processed"
                path={dataset.processed_path}
              />
              <DatasetAvailability
                available={dataset.sample_available}
                icon={<Waves size={15} />}
                label="Sample"
                path={dataset.sample_path ?? "not bundled"}
              />
            </div>
            <p className="dataset-scale">{dataset.estimated_scale}</p>
            <ol className="dataset-actions">
              {dataset.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
      <p className="muted">{ingestionNote}</p>
    </section>
  );
}

function DatasetAvailability({
  available,
  icon,
  label,
  path,
}: {
  available: boolean;
  icon: ReactNode;
  label: string;
  path: string;
}) {
  return (
    <div className="dataset-availability">
      <span className={available ? "is-ready" : "is-missing"}>{icon}</span>
      <div>
        <strong>{label}</strong>
        <small>{path}</small>
      </div>
      <StatusPill tone={available ? "success" : "warning"}>
        {available ? "ready" : "missing"}
      </StatusPill>
    </div>
  );
}

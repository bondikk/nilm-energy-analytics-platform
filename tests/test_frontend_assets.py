from pathlib import Path

from app.core.config import settings


ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"


def test_frontend_entrypoint_references_assets() -> None:
    html = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")

    assert '<div id="root"></div>' in html
    assert '<script type="module" src="/src/main.tsx"></script>' in html
    assert "VoltPulse NILM Platform" in html


def test_frontend_uses_react_typescript_vite_structure() -> None:
    expected_files = [
        "package.json",
        "vite.config.ts",
        "tsconfig.json",
        "src/app/App.tsx",
        "src/app/router.tsx",
        "src/app/providers.tsx",
        "src/pages/OverviewPage.tsx",
        "src/pages/AnalyticsPage.tsx",
        "src/pages/NilmLabPage.tsx",
        "src/pages/AnomaliesPage.tsx",
        "src/pages/SimulatorPage.tsx",
        "src/pages/SettingsPage.tsx",
        "src/components/layout/DashboardLayout.tsx",
        "src/components/charts/NilmOverlayChart.tsx",
        "src/features/nilm/nilmExperiment.ts",
        "src/services/apiClient.ts",
        "src/services/websocketClient.ts",
        "src/types/api.ts",
    ]

    for relative_path in expected_files:
        assert (FRONTEND_DIR / relative_path).exists()


def test_frontend_api_client_points_to_local_backend() -> None:
    api_client = (FRONTEND_DIR / "src/services/apiClient.ts").read_text(encoding="utf-8")
    websocket_client = (FRONTEND_DIR / "src/services/websocketClient.ts").read_text(
        encoding="utf-8"
    )

    assert '"http://127.0.0.1:8000"' in api_client
    assert "/auth/login" in api_client
    assert "/homes" in api_client
    assert "/analytics/summary" in api_client
    assert "/demo/seed" in api_client
    assert "/demo/live-metric" in api_client
    assert "/nilm/lab/demo" in api_client
    assert "/nilm/lab/catalog" in api_client
    assert "/nilm/lab/datasets" in api_client
    assert "/nilm/lab/report" in api_client
    assert "new WebSocket" in websocket_client
    assert "/metrics/live" in websocket_client


def test_frontend_removes_hardcoded_demo_credentials() -> None:
    frontend_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (FRONTEND_DIR / "src").rglob("*")
        if path.suffix in {".ts", ".tsx", ".css"}
    )

    assert "demo@voltpulse.local" not in frontend_text
    assert "demo-password" not in frontend_text


def test_frontend_nilm_lab_has_prediction_overlay_chart() -> None:
    nilm_page = (FRONTEND_DIR / "src/pages/NilmLabPage.tsx").read_text(encoding="utf-8")
    nilm_chart = (FRONTEND_DIR / "src/components/charts/NilmOverlayChart.tsx").read_text(
        encoding="utf-8"
    )

    assert "apiClient.nilmCatalog" in nilm_page
    assert "apiClient.nilmDatasets" in nilm_page
    assert "apiClient.nilmDemo" in nilm_page
    assert "apiClient.nilmReport" in nilm_page
    assert "DatasetLibraryPanel" in nilm_page
    assert "NILM dataset library" in nilm_page
    assert "Dataset explorer" in nilm_page
    assert "Analysis workflow" in nilm_page
    assert "Raw file inventory" in nilm_page
    assert "Processed file inventory" in nilm_page
    assert "raw connected" in nilm_page
    assert "NilmOverlayChart" in nilm_page
    assert "toggleSeries" in nilm_page
    assert "Prediction points" in nilm_page
    assert "Sample-level audit" in nilm_page
    assert "Absolute error" in nilm_page
    assert "aggregate" in nilm_chart
    assert "actual" in nilm_chart
    assert "predicted" in nilm_chart
    assert "absoluteError" in nilm_chart
    assert "ReferenceLine" in nilm_chart


def test_backend_allows_local_frontend_origin() -> None:
    assert "http://127.0.0.1:5173" in settings.frontend_origins
    assert "http://localhost:5173" in settings.frontend_origins
    assert "http://127.0.0.1:5174" in settings.frontend_origins
    assert "http://localhost:5174" in settings.frontend_origins
    assert "http://127.0.0.1:5175" in settings.frontend_origins
    assert "http://localhost:5175" in settings.frontend_origins

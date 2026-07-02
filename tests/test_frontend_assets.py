from pathlib import Path

from app.core.config import settings


ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"


def test_frontend_entrypoint_references_assets() -> None:
    html = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")

    assert '<link rel="stylesheet" href="./styles.css" />' in html
    assert '<script src="./app.js" type="module"></script>' in html
    assert "VoltPulse Dashboard" in html
    assert 'data-view="analytics"' in html
    assert 'data-view="simulator"' in html


def test_frontend_app_points_to_local_backend() -> None:
    app_js = (FRONTEND_DIR / "app.js").read_text(encoding="utf-8")

    assert 'const API_BASE_URL = "http://127.0.0.1:8000";' in app_js
    assert "/auth/login" in app_js
    assert "/analytics/summary" in app_js
    assert "/demo/seed" in app_js
    assert "exportMetricsCsv" in app_js


def test_backend_allows_local_frontend_origin() -> None:
    assert "http://127.0.0.1:5173" in settings.frontend_origins
    assert "http://localhost:5173" in settings.frontend_origins

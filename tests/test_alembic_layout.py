from pathlib import Path


def test_alembic_versions_directory_uses_standard_path() -> None:
    backend_dir = Path(__file__).resolve().parents[1] / "backend"

    assert (backend_dir / "alembic" / "versions" / "20260701_0001_initial_schema.py").is_file()
    assert not (backend_dir / "alembic" / " versions").exists()

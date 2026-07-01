from app.infrastructure.database.base import Base
from app.infrastructure.database import models  # noqa: F401


def test_core_tables_are_registered() -> None:
    expected_tables = {
        "users",
        "homes",
        "devices",
        "energy_metrics",
        "anomalies",
    }

    assert expected_tables.issubset(set(Base.metadata.tables.keys()))
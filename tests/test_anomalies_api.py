import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.anomalies import get_home_anomaly
from app.infrastructure.database.models.anomaly import (
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
)
from app.main import app
from app.schemas.anomaly import AnomalyCreate, AnomalyUpdate


def test_anomaly_routes_are_registered() -> None:
    home_id = uuid.uuid4()
    anomaly_id = uuid.uuid4()

    assert str(app.url_path_for("create_anomaly", home_id=home_id)) == f"/homes/{home_id}/anomalies"
    assert str(app.url_path_for("list_anomalies", home_id=home_id)) == f"/homes/{home_id}/anomalies"
    assert (
        str(app.url_path_for("read_anomaly", home_id=home_id, anomaly_id=anomaly_id))
        == f"/homes/{home_id}/anomalies/{anomaly_id}"
    )
    assert (
        str(app.url_path_for("update_anomaly", home_id=home_id, anomaly_id=anomaly_id))
        == f"/homes/{home_id}/anomalies/{anomaly_id}"
    )
    assert (
        str(app.url_path_for("delete_anomaly", home_id=home_id, anomaly_id=anomaly_id))
        == f"/homes/{home_id}/anomalies/{anomaly_id}"
    )


def test_anomaly_create_strips_text_and_sets_defaults() -> None:
    payload = AnomalyCreate(
        anomaly_type=AnomalyType.POWER_SPIKE,
        detected_at=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        title="  Power spike  ",
        description="  Short event  ",
        score=0.7,
    )

    assert payload.title == "Power spike"
    assert payload.description == "Short event"
    assert payload.severity is AnomalySeverity.MEDIUM
    assert payload.status is AnomalyStatus.OPEN


def test_anomaly_create_rejects_invalid_score() -> None:
    with pytest.raises(ValidationError):
        AnomalyCreate(
            anomaly_type=AnomalyType.POWER_SPIKE,
            detected_at=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
            title="Power spike",
            score=1.5,
        )


def test_anomaly_update_rejects_blank_title() -> None:
    with pytest.raises(ValidationError):
        AnomalyUpdate(title="   ")


@pytest.mark.asyncio
async def test_get_home_anomaly_raises_404_when_missing() -> None:
    home = SimpleNamespace(id=uuid.uuid4())
    session = SimpleNamespace(scalar=AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc_info:
        await get_home_anomaly(
            anomaly_id=uuid.uuid4(),
            home=home,
            session=session,
        )

    assert exc_info.value.status_code == 404

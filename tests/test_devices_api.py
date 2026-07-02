import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.devices import get_home_device
from app.infrastructure.database.models.device import DeviceStatus, DeviceType
from app.main import app
from app.schemas.device import DeviceCreate, DeviceUpdate


def test_device_routes_are_registered() -> None:
    home_id = uuid.uuid4()
    device_id = uuid.uuid4()

    assert str(app.url_path_for("create_device", home_id=home_id)) == f"/homes/{home_id}/devices"
    assert str(app.url_path_for("list_devices", home_id=home_id)) == f"/homes/{home_id}/devices"
    assert (
        str(app.url_path_for("read_device", home_id=home_id, device_id=device_id))
        == f"/homes/{home_id}/devices/{device_id}"
    )
    assert (
        str(app.url_path_for("update_device", home_id=home_id, device_id=device_id))
        == f"/homes/{home_id}/devices/{device_id}"
    )
    assert (
        str(app.url_path_for("delete_device", home_id=home_id, device_id=device_id))
        == f"/homes/{home_id}/devices/{device_id}"
    )


def test_device_create_strips_text_fields_and_sets_defaults() -> None:
    payload = DeviceCreate(
        external_id="  meter-1  ",
        name="  Main meter  ",
        firmware_version="  1.0.0  ",
    )

    assert payload.external_id == "meter-1"
    assert payload.name == "Main meter"
    assert payload.firmware_version == "1.0.0"
    assert payload.device_type is DeviceType.SIMULATED_METER
    assert payload.status is DeviceStatus.ACTIVE


def test_device_update_rejects_blank_external_id() -> None:
    with pytest.raises(ValidationError):
        DeviceUpdate(external_id="   ")


@pytest.mark.asyncio
async def test_get_home_device_raises_404_when_missing() -> None:
    home = SimpleNamespace(id=uuid.uuid4())
    session = SimpleNamespace(scalar=AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc_info:
        await get_home_device(
            device_id=uuid.uuid4(),
            home=home,
            session=session,
        )

    assert exc_info.value.status_code == 404

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes.homes import get_current_user_home
from app.main import app
from app.schemas.home import HomeCreate, HomeUpdate


def test_home_routes_are_registered() -> None:
    home_id = uuid.uuid4()

    assert str(app.url_path_for("create_home")) == "/homes"
    assert str(app.url_path_for("list_homes")) == "/homes"
    assert str(app.url_path_for("read_home", home_id=home_id)) == f"/homes/{home_id}"
    assert str(app.url_path_for("update_home", home_id=home_id)) == f"/homes/{home_id}"
    assert str(app.url_path_for("delete_home", home_id=home_id)) == f"/homes/{home_id}"


def test_home_create_strips_text_fields() -> None:
    payload = HomeCreate(
        name="  Apartment  ",
        timezone="  Europe/Bratislava  ",
        location_label="  Bratislava  ",
    )

    assert payload.name == "Apartment"
    assert payload.timezone == "Europe/Bratislava"
    assert payload.location_label == "Bratislava"


def test_home_update_rejects_blank_name() -> None:
    with pytest.raises(ValidationError):
        HomeUpdate(name="   ")


@pytest.mark.asyncio
async def test_get_current_user_home_raises_404_when_missing() -> None:
    current_user = SimpleNamespace(id=uuid.uuid4())
    session = SimpleNamespace(scalar=AsyncMock(return_value=None))

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_home(
            home_id=uuid.uuid4(),
            current_user=current_user,
            session=session,
        )

    assert exc_info.value.status_code == 404

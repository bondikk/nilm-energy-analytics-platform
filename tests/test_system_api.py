import pytest

from app.api.routes.system import health_check
from app.core.config import settings
from app.main import app


def test_health_route_is_registered() -> None:
    assert str(app.url_path_for("health_check")) == "/health"


@pytest.mark.asyncio
async def test_health_check_payload() -> None:
    assert await health_check() == {
        "status": "ok",
        "service": settings.project_name,
        "environment": settings.environment,
    }

import pytest
from pydantic import ValidationError

from app.main import app
from app.schemas.demo import DemoSeedRequest


def test_demo_seed_route_is_registered() -> None:
    assert str(app.url_path_for("seed_demo_dataset")) == "/demo/seed"


def test_demo_seed_request_normalizes_email() -> None:
    payload = DemoSeedRequest(email="  Demo@VoltPulse.LOCAL  ")

    assert payload.email == "demo@voltpulse.local"


def test_demo_seed_request_rejects_invalid_sample_count() -> None:
    with pytest.raises(ValidationError):
        DemoSeedRequest(sample_count=0)

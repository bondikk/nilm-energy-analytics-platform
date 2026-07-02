import uuid

from app.main import app


def test_realtime_metrics_websocket_route_is_registered() -> None:
    home_id = uuid.uuid4()

    assert (
        str(app.url_path_for("metrics_live", home_id=home_id))
        == f"/homes/{home_id}/metrics/live"
    )

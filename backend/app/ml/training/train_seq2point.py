from __future__ import annotations

from app.ml.models.seq2point import Seq2PointModelSpec


def planned_seq2point_spec(appliance: str, window_size: int = 599) -> Seq2PointModelSpec:
    return Seq2PointModelSpec(appliance=appliance, window_size=window_size)

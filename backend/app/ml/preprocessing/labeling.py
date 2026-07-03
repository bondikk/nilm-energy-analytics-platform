from __future__ import annotations

from typing import Mapping, Sequence

from app.ml.datasets.schema import UnifiedNILMRow


DEFAULT_ON_THRESHOLDS_W = {
    "fridge": 30.0,
    "kettle": 1_000.0,
    "washing_machine": 20.0,
    "dishwasher": 20.0,
    "microwave": 500.0,
}


def appliance_on_labels(
    rows: Sequence[UnifiedNILMRow],
    appliance: str,
    thresholds_w: Mapping[str, float] = DEFAULT_ON_THRESHOLDS_W,
) -> tuple[int, ...]:
    threshold = thresholds_w.get(appliance, 10.0)
    return tuple(
        1 if row.appliance_power_w.get(appliance, 0.0) >= threshold else 0
        for row in rows
    )

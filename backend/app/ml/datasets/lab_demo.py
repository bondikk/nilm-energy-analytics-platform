from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.ml.datasets.schema import UnifiedNILMRow


SUPPORTED_LAB_DATASETS = ("uk-dale", "redd", "refit")
SUPPORTED_LAB_HOUSES = ("house-1", "house-2", "house-3")
SUPPORTED_LAB_APPLIANCES = ("kettle", "fridge", "washing_machine", "dishwasher")


def build_lab_demo_rows() -> tuple[UnifiedNILMRow, ...]:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    samples = (
        (150.0, 120.0, 0.0, 0.0, 0.0),
        (152.0, 122.0, 0.0, 0.0, 0.0),
        (156.0, 126.0, 0.0, 0.0, 0.0),
        (178.0, 124.0, 0.0, 0.0, 0.0),
        (2350.0, 125.0, 2180.0, 0.0, 0.0),
        (2368.0, 128.0, 2205.0, 0.0, 0.0),
        (172.0, 130.0, 0.0, 0.0, 0.0),
        (56.0, 0.0, 0.0, 0.0, 0.0),
        (64.0, 0.0, 0.0, 0.0, 0.0),
        (622.0, 0.0, 0.0, 540.0, 0.0),
        (675.0, 0.0, 0.0, 590.0, 0.0),
        (132.0, 0.0, 0.0, 0.0, 0.0),
        (1025.0, 0.0, 0.0, 0.0, 870.0),
        (1010.0, 0.0, 0.0, 0.0, 860.0),
        (142.0, 0.0, 0.0, 0.0, 0.0),
        (263.0, 118.0, 0.0, 0.0, 0.0),
    )

    return tuple(
        UnifiedNILMRow(
            timestamp=start + timedelta(seconds=index * 8),
            aggregate_power_w=aggregate_power_w,
            appliance_power_w={
                "fridge": fridge_w,
                "kettle": kettle_w,
                "washing_machine": washing_machine_w,
                "dishwasher": dishwasher_w,
            },
        )
        for index, (
            aggregate_power_w,
            fridge_w,
            kettle_w,
            washing_machine_w,
            dishwasher_w,
        ) in enumerate(samples)
    )

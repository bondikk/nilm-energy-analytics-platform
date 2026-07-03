from __future__ import annotations

import csv
from pathlib import Path
from typing import Mapping

from app.ml.datasets.schema import UnifiedNILMDataset, UnifiedNILMRow, parse_timestamp


DEFAULT_REFIT_COLUMNS = {
    "aggregate_power_w": "Aggregate",
    "fridge": "Fridge",
    "washing_machine": "Washing Machine",
    "dishwasher": "Dishwasher",
    "microwave": "Microwave",
    "kettle": "Kettle",
}


def load_refit_csv(
    path: Path,
    *,
    house_id: str,
    column_map: Mapping[str, str] = DEFAULT_REFIT_COLUMNS,
    sample_period_seconds: int = 8,
) -> UnifiedNILMDataset:
    appliances = tuple(
        key
        for key in column_map
        if key != "aggregate_power_w" and key != "timestamp"
    )

    with path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        rows = tuple(
            UnifiedNILMRow(
                timestamp=parse_timestamp(record[column_map.get("timestamp", "Time")]),
                aggregate_power_w=_read_float(record, column_map["aggregate_power_w"]),
                appliance_power_w={
                    appliance: _read_float(record, column_map[appliance])
                    for appliance in appliances
                },
            )
            for record in reader
        )

    return UnifiedNILMDataset(
        rows=tuple(sorted(rows, key=lambda row: row.timestamp)),
        appliances=appliances,
        source="REFIT",
        house_id=house_id,
        sample_period_seconds=sample_period_seconds,
    )


def _read_float(record: Mapping[str, str], column: str) -> float:
    value = record.get(column, "")
    if value == "":
        return 0.0
    return float(value)

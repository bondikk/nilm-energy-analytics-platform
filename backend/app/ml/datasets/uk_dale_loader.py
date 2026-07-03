from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Mapping

from app.ml.datasets.schema import UnifiedNILMDataset, UnifiedNILMRow, write_unified_nilm_csv


@dataclass(frozen=True)
class UKDaleHouseConfig:
    house_id: int
    aggregate_channel: int | None
    appliance_channels: Mapping[str, int]
    sample_period_seconds: int = 6


DEFAULT_UK_DALE_HOUSE_1 = UKDaleHouseConfig(
    house_id=1,
    aggregate_channel=None,
    appliance_channels={
        "fridge": 12,
        "kettle": 10,
        "washing_machine": 5,
        "dishwasher": 6,
        "microwave": 13,
    },
)


def load_uk_dale_house(
    raw_house_dir: Path,
    config: UKDaleHouseConfig = DEFAULT_UK_DALE_HOUSE_1,
) -> UnifiedNILMDataset:
    aggregate_path = _aggregate_path(raw_house_dir, config.aggregate_channel)
    aggregate = _read_channel_file(aggregate_path)
    appliance_series = {
        appliance: _read_channel_file(raw_house_dir / f"channel_{channel}.dat")
        for appliance, channel in config.appliance_channels.items()
    }

    rows = tuple(
        UnifiedNILMRow(
            timestamp=datetime.fromtimestamp(epoch, tz=UTC),
            aggregate_power_w=power_w,
            appliance_power_w={
                appliance: series.get(epoch, 0.0)
                for appliance, series in appliance_series.items()
            },
        )
        for epoch, power_w in sorted(aggregate.items())
    )

    return UnifiedNILMDataset(
        rows=rows,
        appliances=tuple(config.appliance_channels),
        source="UK-DALE",
        house_id=str(config.house_id),
        sample_period_seconds=config.sample_period_seconds,
    )


def convert_uk_dale_house_to_unified_csv(
    raw_house_dir: Path,
    output_path: Path,
    config: UKDaleHouseConfig = DEFAULT_UK_DALE_HOUSE_1,
) -> UnifiedNILMDataset:
    dataset = load_uk_dale_house(raw_house_dir=raw_house_dir, config=config)
    write_unified_nilm_csv(dataset.rows, output_path, dataset.appliances)
    return dataset


def _aggregate_path(raw_house_dir: Path, aggregate_channel: int | None) -> Path:
    if aggregate_channel is not None:
        return raw_house_dir / f"channel_{aggregate_channel}.dat"

    mains_path = raw_house_dir / "mains.dat"
    if mains_path.exists():
        return mains_path

    return raw_house_dir / "channel_1.dat"


def _read_channel_file(path: Path) -> dict[int, float]:
    if not path.exists():
        raise FileNotFoundError(f"NILM channel file not found: {path}")

    readings: dict[int, float] = {}
    with path.open("r", encoding="utf-8") as channel_file:
        for line_number, line in enumerate(channel_file, start=1):
            stripped = line.strip()
            if not stripped:
                continue

            parts = stripped.split()
            if len(parts) < 2:
                raise ValueError(f"Invalid UK-DALE row at {path}:{line_number}: {line!r}")

            readings[int(float(parts[0]))] = float(parts[1])

    return readings

from __future__ import annotations

from pathlib import Path

from app.ml.datasets.schema import UnifiedNILMDataset
from app.ml.datasets.uk_dale_loader import UKDaleHouseConfig, load_uk_dale_house


def load_redd_low_freq_house(
    raw_house_dir: Path,
    aggregate_channel: int = 1,
    appliance_channels: dict[str, int] | None = None,
) -> UnifiedNILMDataset:
    channels = appliance_channels or {
        "fridge": 5,
        "dishwasher": 6,
        "washing_machine": 20,
        "microwave": 11,
    }
    dataset = load_uk_dale_house(
        raw_house_dir=raw_house_dir,
        config=UKDaleHouseConfig(
            house_id=_house_id_from_path(raw_house_dir),
            aggregate_channel=aggregate_channel,
            appliance_channels=channels,
            sample_period_seconds=3,
        ),
    )
    return UnifiedNILMDataset(
        rows=dataset.rows,
        appliances=dataset.appliances,
        source="REDD",
        house_id=dataset.house_id,
        sample_period_seconds=3,
    )


def _house_id_from_path(path: Path) -> int:
    digits = "".join(character for character in path.name if character.isdigit())
    return int(digits or 0)

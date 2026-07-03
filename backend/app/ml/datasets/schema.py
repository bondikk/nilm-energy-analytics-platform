from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, Mapping, Sequence


TIMESTAMP_COLUMN = "timestamp"
AGGREGATE_POWER_COLUMN = "aggregate_power_w"
DEFAULT_APPLIANCES = (
    "fridge",
    "kettle",
    "washing_machine",
    "dishwasher",
    "microwave",
)


@dataclass(frozen=True)
class UnifiedNILMRow:
    timestamp: datetime
    aggregate_power_w: float
    appliance_power_w: Mapping[str, float]

    def to_csv_record(self, appliances: Sequence[str]) -> dict[str, str]:
        record = {
            TIMESTAMP_COLUMN: self.timestamp.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            AGGREGATE_POWER_COLUMN: _format_power(self.aggregate_power_w),
        }
        for appliance in appliances:
            record[f"{appliance}_w"] = _format_power(self.appliance_power_w.get(appliance, 0.0))
        return record


@dataclass(frozen=True)
class UnifiedNILMDataset:
    rows: tuple[UnifiedNILMRow, ...]
    appliances: tuple[str, ...]
    source: str
    house_id: str | None = None
    sample_period_seconds: int | None = None

    @property
    def sample_count(self) -> int:
        return len(self.rows)


def unified_fieldnames(appliances: Sequence[str]) -> list[str]:
    return [
        TIMESTAMP_COLUMN,
        AGGREGATE_POWER_COLUMN,
        *[f"{appliance}_w" for appliance in appliances],
    ]


def write_unified_nilm_csv(
    rows: Iterable[UnifiedNILMRow],
    path: Path,
    appliances: Sequence[str] = DEFAULT_APPLIANCES,
) -> int:
    clean_rows = sorted(rows, key=lambda row: row.timestamp)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=unified_fieldnames(appliances))
        writer.writeheader()
        for row in clean_rows:
            writer.writerow(row.to_csv_record(appliances))

    return len(clean_rows)


def read_unified_nilm_csv(
    path: Path,
    appliances: Sequence[str] | None = None,
    *,
    source: str = "unified_csv",
    house_id: str | None = None,
    sample_period_seconds: int | None = None,
) -> UnifiedNILMDataset:
    with path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames is None:
            raise ValueError(f"{path} has no CSV header")

        resolved_appliances = tuple(appliances or _appliances_from_fieldnames(reader.fieldnames))
        rows = tuple(
            UnifiedNILMRow(
                timestamp=parse_timestamp(record[TIMESTAMP_COLUMN]),
                aggregate_power_w=_parse_power(record[AGGREGATE_POWER_COLUMN]),
                appliance_power_w={
                    appliance: _parse_power(record.get(f"{appliance}_w", "0"))
                    for appliance in resolved_appliances
                },
            )
            for record in reader
        )

    return UnifiedNILMDataset(
        rows=tuple(sorted(rows, key=lambda row: row.timestamp)),
        appliances=resolved_appliances,
        source=source,
        house_id=house_id,
        sample_period_seconds=sample_period_seconds,
    )


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _appliances_from_fieldnames(fieldnames: Sequence[str]) -> tuple[str, ...]:
    return tuple(
        fieldname.removesuffix("_w")
        for fieldname in fieldnames
        if fieldname.endswith("_w") and fieldname != AGGREGATE_POWER_COLUMN
    )


def _parse_power(value: str | None) -> float:
    if value is None or value == "":
        return 0.0
    return float(value)


def _format_power(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")

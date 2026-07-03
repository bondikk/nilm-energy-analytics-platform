from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Sequence

from app.ml.datasets.schema import UnifiedNILMRow


@dataclass(frozen=True)
class Seq2PointWindow:
    center_timestamp: datetime
    aggregate_window_w: tuple[float, ...]
    target_power_w: float
    appliance: str


def build_seq2point_windows(
    rows: Sequence[UnifiedNILMRow],
    *,
    appliance: str,
    radius: int = 299,
) -> tuple[Seq2PointWindow, ...]:
    if radius < 0:
        raise ValueError("radius must be non-negative")

    sorted_rows = tuple(sorted(rows, key=lambda row: row.timestamp))
    window_size = radius * 2 + 1
    if len(sorted_rows) < window_size:
        return ()

    windows: list[Seq2PointWindow] = []
    for center_index in range(radius, len(sorted_rows) - radius):
        start = center_index - radius
        end = center_index + radius + 1
        center = sorted_rows[center_index]
        windows.append(
            Seq2PointWindow(
                center_timestamp=center.timestamp,
                aggregate_window_w=tuple(
                    row.aggregate_power_w for row in sorted_rows[start:end]
                ),
                target_power_w=center.appliance_power_w.get(appliance, 0.0),
                appliance=appliance,
            )
        )

    return tuple(windows)


def rolling_windows(values: Sequence[float], *, size: int) -> Iterable[tuple[float, ...]]:
    if size <= 0:
        raise ValueError("size must be positive")
    for start in range(0, len(values) - size + 1):
        yield tuple(values[start : start + size])

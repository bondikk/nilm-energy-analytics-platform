from __future__ import annotations

import csv
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ml.datasets.schema import parse_timestamp


@dataclass(frozen=True)
class DatasetColumnProfile:
    name: str
    kind: str
    non_empty_count: int
    missing_count: int
    min_value: float | None = None
    max_value: float | None = None
    mean_value: float | None = None


@dataclass(frozen=True)
class DatasetStructureNode:
    path: str
    kind: str
    shape: str | None = None
    dtype: str | None = None


@dataclass(frozen=True)
class DatasetFileProfile:
    name: str
    path: str
    kind: str
    size_bytes: int | None
    status: str
    row_count: int | None = None
    column_count: int | None = None
    columns: tuple[str, ...] = ()
    preview_rows: tuple[dict[str, str], ...] = ()
    column_profiles: tuple[DatasetColumnProfile, ...] = ()
    start_time: datetime | None = None
    end_time: datetime | None = None
    structure: tuple[DatasetStructureNode, ...] = ()
    notes: tuple[str, ...] = ()


POWER_COLUMN_HINTS = (
    "aggregate",
    "appliance",
    "fridge",
    "freezer",
    "kettle",
    "washing",
    "dishwasher",
    "microwave",
    "power",
)
TIME_COLUMN_HINTS = ("time", "timestamp", "date")


@lru_cache(maxsize=64)
def profile_dataset_file(path: Path, *, row_limit: int = 250_000) -> DatasetFileProfile:
    kind = path.suffix.lower().lstrip(".") or "file"
    size_bytes = _safe_size(path)

    if kind == "csv":
        return _profile_csv_file(path, kind=kind, size_bytes=size_bytes, row_limit=row_limit)
    if kind in {"h5", "hdf5"}:
        return _profile_hdf5_file(path, kind=kind, size_bytes=size_bytes)

    return DatasetFileProfile(
        name=path.name,
        path=path.as_posix(),
        kind=kind,
        size_bytes=size_bytes,
        status="unsupported",
        notes=(f"No profiler is available for .{kind} files yet.",),
    )


def _profile_csv_file(path: Path, *, kind: str, size_bytes: int | None, row_limit: int) -> DatasetFileProfile:
    preview_rows: list[dict[str, str]] = []
    row_count = 0
    truncated = False
    numeric_profiles: dict[str, _NumericAccumulator] = {}
    missing_counts: dict[str, int] = {}
    non_empty_counts: dict[str, int] = {}
    start_time: datetime | None = None
    end_time: datetime | None = None

    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        columns = tuple(reader.fieldnames or ())
        interesting_columns = _interesting_csv_columns(columns)
        time_column = _time_column(columns)

        for column in interesting_columns:
            numeric_profiles[column] = _NumericAccumulator()
            missing_counts[column] = 0
            non_empty_counts[column] = 0

        for record in reader:
            row_count += 1
            if len(preview_rows) < 5:
                preview_rows.append({column: record.get(column, "") for column in columns[:12]})

            if time_column:
                parsed = _safe_timestamp(record.get(time_column, ""))
                if parsed is not None:
                    start_time = parsed if start_time is None else min(start_time, parsed)
                    end_time = parsed if end_time is None else max(end_time, parsed)

            if row_count <= row_limit:
                for column in interesting_columns:
                    value = record.get(column, "")
                    if value == "":
                        missing_counts[column] += 1
                        continue
                    non_empty_counts[column] += 1
                    numeric_value = _safe_float(value)
                    if numeric_value is not None:
                        numeric_profiles[column].add(numeric_value)
            elif not truncated:
                truncated = True

    notes = []
    if truncated:
        notes.append(
            f"Column statistics use the first {row_limit:,} rows to keep profiling responsive."
        )

    return DatasetFileProfile(
        name=path.name,
        path=path.as_posix(),
        kind=kind,
        size_bytes=size_bytes,
        status="profiled",
        row_count=row_count,
        column_count=len(columns),
        columns=columns,
        preview_rows=tuple(preview_rows),
        column_profiles=tuple(
            DatasetColumnProfile(
                name=column,
                kind="numeric" if numeric_profiles[column].count else "text",
                non_empty_count=non_empty_counts[column],
                missing_count=missing_counts[column],
                min_value=numeric_profiles[column].minimum,
                max_value=numeric_profiles[column].maximum,
                mean_value=numeric_profiles[column].mean,
            )
            for column in interesting_columns
        ),
        start_time=start_time,
        end_time=end_time,
        notes=tuple(notes),
    )


def _profile_hdf5_file(path: Path, *, kind: str, size_bytes: int | None) -> DatasetFileProfile:
    try:
        import h5py  # type: ignore[import-untyped]
    except ImportError:
        return DatasetFileProfile(
            name=path.name,
            path=path.as_posix(),
            kind=kind,
            size_bytes=size_bytes,
            status="needs_hdf5_reader",
            notes=(
                "Install the h5py backend dependency to inspect HDF5 groups, datasets, shapes, and dtypes.",
            ),
        )

    nodes: list[DatasetStructureNode] = []
    queue: deque[tuple[str, Any]] = deque()
    with h5py.File(path, "r") as hdf_file:
        queue.extend((key, hdf_file[key]) for key in sorted(hdf_file.keys()))
        while queue and len(nodes) < 80:
            node_path, node = queue.popleft()
            if isinstance(node, h5py.Dataset):
                nodes.append(
                    DatasetStructureNode(
                        path=node_path,
                        kind="dataset",
                        shape=str(tuple(node.shape)),
                        dtype=str(node.dtype),
                    )
                )
            elif isinstance(node, h5py.Group):
                nodes.append(DatasetStructureNode(path=node_path, kind="group"))
                queue.extend(
                    (f"{node_path}/{key}", node[key])
                    for key in sorted(node.keys())
                )

    notes: tuple[str, ...] = ()
    if len(nodes) >= 80:
        notes = ("Showing the first 80 HDF5 nodes.",)

    return DatasetFileProfile(
        name=path.name,
        path=path.as_posix(),
        kind=kind,
        size_bytes=size_bytes,
        status="profiled",
        structure=tuple(nodes),
        notes=notes,
    )


def _interesting_csv_columns(columns: tuple[str, ...]) -> tuple[str, ...]:
    selected = [
        column
        for column in columns
        if any(hint in column.lower() for hint in POWER_COLUMN_HINTS)
    ]
    return tuple(selected[:12] or columns[:12])


def _time_column(columns: tuple[str, ...]) -> str | None:
    for column in columns:
        if column.lower() in TIME_COLUMN_HINTS:
            return column
    for column in columns:
        if any(hint in column.lower() for hint in TIME_COLUMN_HINTS):
            return column
    return None


def _safe_timestamp(value: str) -> datetime | None:
    try:
        return parse_timestamp(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_size(path: Path) -> int | None:
    try:
        return path.stat().st_size
    except OSError:
        return None


@dataclass
class _NumericAccumulator:
    count: int = 0
    total: float = 0.0
    minimum: float | None = None
    maximum: float | None = None

    def add(self, value: float) -> None:
        self.count += 1
        self.total += value
        self.minimum = value if self.minimum is None else min(self.minimum, value)
        self.maximum = value if self.maximum is None else max(self.maximum, value)

    @property
    def mean(self) -> float | None:
        if self.count == 0:
            return None
        return self.total / self.count

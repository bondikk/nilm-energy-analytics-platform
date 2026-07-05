from __future__ import annotations

from pathlib import Path
from typing import TypedDict

from app.ml.datasets.schema import UnifiedNILMRow, read_unified_nilm_csv


SUPPORTED_LAB_DATASETS = ("uk-dale", "redd", "refit")
SUPPORTED_LAB_HOUSES = ("house-1", "house-2", "house-3")
SUPPORTED_LAB_APPLIANCES = ("kettle", "fridge", "washing_machine", "dishwasher")

LAB_DATASET_LABELS = {
    "uk-dale": "UK-DALE",
    "redd": "REDD",
    "refit": "REFIT",
}

LAB_DATASET_DESCRIPTIONS = {
    "uk-dale": "Public dataset with aggregate and appliance-level demand for UK homes.",
    "redd": "Classic NILM benchmark dataset for low-frequency disaggregation experiments.",
    "refit": "Low-frequency residential dataset close to smart-meter SaaS scenarios.",
}


class LabDatasetMetadata(TypedDict):
    scope: str
    houses: int
    appliances: tuple[str, ...]
    sample_period: str
    estimated_scale: str
    public_reference: str
    raw_path: str
    processed_path: str
    sample_path: str
    status: str
    actions: tuple[str, ...]


class ProjectDatasetFile(TypedDict):
    name: str
    path: str
    kind: str
    size_bytes: int | None
    is_symlink: bool


LAB_DATASET_METADATA: dict[str, LabDatasetMetadata] = {
    "uk-dale": {
        "scope": "5 monitored UK homes with whole-house and appliance-level demand.",
        "houses": 5,
        "appliances": ("kettle", "fridge", "washing_machine", "dishwasher", "microwave"),
        "sample_period": "1/6 Hz appliance channels; high-frequency whole-house data is available.",
        "estimated_scale": "One house includes more than 600 days of readings; full raw data is kept outside git.",
        "public_reference": "https://arxiv.org/abs/1404.0284",
        "raw_path": "data/raw/uk-dale/",
        "processed_path": "data/processed/uk_dale_house_1.csv",
        "sample_path": "data/samples/uk_dale_house_1_sample.csv",
        "status": "first-class target",
        "actions": (
            "Download UK-DALE into data/raw/uk-dale/",
            "Convert a house with app.tools.convert_uk_dale",
            "Train and evaluate baseline models per appliance",
        ),
    },
    "redd": {
        "scope": "Classic benchmark houses with aggregate and circuit-level appliance channels.",
        "houses": 6,
        "appliances": ("fridge", "lighting", "washer_dryer", "microwave", "dishwasher"),
        "sample_period": "Low-frequency benchmark data commonly used for NILM comparisons.",
        "estimated_scale": "Research benchmark scale; raw files are not bundled with this repository.",
        "public_reference": "http://redd.csail.mit.edu/",
        "raw_path": "data/raw/redd/",
        "processed_path": "data/processed/redd_house_1.csv",
        "sample_path": "",
        "status": "loader scaffold",
        "actions": (
            "Place REDD raw files under data/raw/redd/",
            "Add a converter command when the raw format is available locally",
            "Use for paper-style benchmark comparison after UK-DALE",
        ),
    },
    "refit": {
        "scope": "Residential aggregate and appliance-level measurements from 20 homes.",
        "houses": 20,
        "appliances": ("fridge", "freezer", "washing_machine", "dishwasher", "kettle"),
        "sample_period": "Approximately 8-second low-frequency smart-meter style readings.",
        "estimated_scale": "Multi-home, multi-year style dataset suitable for SaaS-like scenarios.",
        "public_reference": "https://pureportal.strath.ac.uk/en/datasets/refit-electrical-load-measurements",
        "raw_path": "data/raw/refit/",
        "processed_path": "data/processed/refit_house_1.csv",
        "sample_path": "",
        "status": "loader scaffold",
        "actions": (
            "Place REFIT CSV files under data/raw/refit/",
            "Convert homes into the unified NILM CSV schema",
            "Use for low-frequency model validation after UK-DALE",
        ),
    },
}

LAB_APPLIANCE_LABELS = {
    "kettle": "Kettle",
    "fridge": "Fridge",
    "washing_machine": "Washing machine",
    "dishwasher": "Dishwasher",
}

LAB_APPLIANCE_NOMINAL_POWER_W = {
    "kettle": 2200.0,
    "fridge": 120.0,
    "washing_machine": 500.0,
    "dishwasher": 900.0,
}

PACKAGED_LAB_SAMPLE_PATH = Path(__file__).resolve().parent / "samples" / "uk_dale_house_1_sample.csv"
PROJECT_LAB_SAMPLE_PATH = "data/samples/uk_dale_house_1_sample.csv"
PROJECT_ROOT_CANDIDATES = (
    Path.cwd(),
    Path(__file__).resolve().parents[3],
    Path(__file__).resolve().parents[4],
)


def resolve_project_path(relative_path: str) -> Path:
    for root in PROJECT_ROOT_CANDIDATES:
        candidate = root / relative_path
        if candidate.exists() or candidate.is_symlink():
            return candidate
    return PROJECT_ROOT_CANDIDATES[0] / relative_path


def build_lab_demo_rows() -> tuple[UnifiedNILMRow, ...]:
    dataset = read_unified_nilm_csv(
        PACKAGED_LAB_SAMPLE_PATH,
        source="UK-DALE packaged sample",
        house_id="house-1",
        sample_period_seconds=8,
    )
    return dataset.rows


def project_path_exists(relative_path: str) -> bool:
    if not relative_path:
        return False
    path = resolve_project_path(relative_path)
    return path.exists() or path.is_symlink()


def project_path_has_data(relative_path: str) -> bool:
    if not relative_path:
        return False

    path = resolve_project_path(relative_path)
    if path.is_file():
        return True
    if not path.is_dir():
        return False

    return any(
        child.name != ".gitkeep" and (child.is_file() or child.is_symlink())
        for child in path.iterdir()
    )


def _path_relative_to_project(path: Path) -> str:
    for root in PROJECT_ROOT_CANDIDATES:
        try:
            return path.relative_to(root).as_posix()
        except ValueError:
            continue
    return path.as_posix()


def _file_size_bytes(path: Path) -> int | None:
    try:
        return path.stat().st_size
    except OSError:
        return None


def _file_kind(path: Path) -> str:
    suffix = path.suffix.lower().lstrip(".")
    return suffix or "file"


def project_file_inventory(
    relative_path: str,
    *,
    limit: int = 40,
) -> tuple[tuple[ProjectDatasetFile, ...], int, int | None]:
    if not relative_path:
        return (), 0, None

    path = resolve_project_path(relative_path)
    if not (path.exists() or path.is_symlink()):
        return (), 0, None

    if path.is_file() or path.is_symlink():
        size_bytes = _file_size_bytes(path)
        return (
            (
                ProjectDatasetFile(
                    name=path.name,
                    path=_path_relative_to_project(path),
                    kind=_file_kind(path),
                    size_bytes=size_bytes,
                    is_symlink=path.is_symlink(),
                ),
            ),
            1,
            size_bytes,
        )

    visible_files: list[ProjectDatasetFile] = []
    total_count = 0
    total_size = 0
    has_unknown_size = False

    for child in sorted(path.rglob("*")):
        if child.name == ".gitkeep" or not (child.is_file() or child.is_symlink()):
            continue

        total_count += 1
        size_bytes = _file_size_bytes(child)
        if size_bytes is None:
            has_unknown_size = True
        else:
            total_size += size_bytes

        if len(visible_files) < limit:
            visible_files.append(
                ProjectDatasetFile(
                    name=child.name,
                    path=_path_relative_to_project(child),
                    kind=_file_kind(child),
                    size_bytes=size_bytes,
                    is_symlink=child.is_symlink(),
                )
            )

    return tuple(visible_files), total_count, None if has_unknown_size else total_size

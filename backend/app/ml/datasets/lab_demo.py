from __future__ import annotations

from pathlib import Path

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


def build_lab_demo_rows() -> tuple[UnifiedNILMRow, ...]:
    dataset = read_unified_nilm_csv(
        PACKAGED_LAB_SAMPLE_PATH,
        source="UK-DALE packaged sample",
        house_id="house-1",
        sample_period_seconds=8,
    )
    return dataset.rows

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from statistics import fmean, pstdev
from typing import Mapping, Sequence

from app.ml.datasets.schema import UnifiedNILMRow


@dataclass(frozen=True)
class ApplianceSignature:
    appliance: str
    min_delta_w: float
    max_delta_w: float
    nominal_power_w: float


@dataclass(frozen=True)
class BaselinePrediction:
    timestamp: datetime
    appliance: str
    predicted_power_w: float
    is_on: bool
    confidence: float
    reason: str


DEFAULT_SIGNATURES = (
    ApplianceSignature("fridge", 70.0, 220.0, 120.0),
    ApplianceSignature("washing_machine", 250.0, 700.0, 500.0),
    ApplianceSignature("dishwasher", 500.0, 1_200.0, 900.0),
    ApplianceSignature("microwave", 900.0, 1_600.0, 1_200.0),
    ApplianceSignature("kettle", 1_700.0, 3_200.0, 2_200.0),
)


def predict_appliance_power_threshold(
    rows: Sequence[UnifiedNILMRow],
    *,
    signatures: Sequence[ApplianceSignature] = DEFAULT_SIGNATURES,
) -> dict[str, tuple[BaselinePrediction, ...]]:
    sorted_rows = tuple(sorted(rows, key=lambda row: row.timestamp))
    predictions: dict[str, list[BaselinePrediction]] = {
        signature.appliance: [] for signature in signatures
    }
    state_by_appliance = {signature.appliance: False for signature in signatures}

    if not sorted_rows:
        return {appliance: tuple(values) for appliance, values in predictions.items()}

    for index, row in enumerate(sorted_rows):
        delta_w = 0.0 if index == 0 else row.aggregate_power_w - sorted_rows[index - 1].aggregate_power_w
        matched = _signature_for_delta(delta_w, signatures)
        if matched is not None:
            state_by_appliance[matched.appliance] = delta_w > 0

        for signature in signatures:
            is_on = state_by_appliance[signature.appliance]
            predictions[signature.appliance].append(
                BaselinePrediction(
                    timestamp=row.timestamp,
                    appliance=signature.appliance,
                    predicted_power_w=signature.nominal_power_w if is_on else 0.0,
                    is_on=is_on,
                    confidence=_confidence(delta_w, signature) if matched == signature else 0.5,
                    reason=_reason(delta_w, signature, matched),
                )
            )

    return {appliance: tuple(values) for appliance, values in predictions.items()}


def extract_window_features(values: Sequence[float]) -> dict[str, float]:
    if not values:
        raise ValueError("cannot extract features from an empty window")

    first = values[0]
    last = values[-1]
    return {
        "mean_power": float(fmean(values)),
        "max_power": float(max(values)),
        "min_power": float(min(values)),
        "std_power": float(pstdev(values)) if len(values) > 1 else 0.0,
        "delta_power": float(last - first),
    }


def prediction_series_for_appliance(
    predictions: Mapping[str, Sequence[BaselinePrediction]],
    appliance: str,
) -> tuple[float, ...]:
    return tuple(prediction.predicted_power_w for prediction in predictions.get(appliance, ()))


def _signature_for_delta(
    delta_w: float,
    signatures: Sequence[ApplianceSignature],
) -> ApplianceSignature | None:
    magnitude = abs(delta_w)
    for signature in signatures:
        if signature.min_delta_w <= magnitude <= signature.max_delta_w:
            return signature
    return None


def _confidence(delta_w: float, signature: ApplianceSignature) -> float:
    magnitude = abs(delta_w)
    midpoint = (signature.min_delta_w + signature.max_delta_w) / 2
    span = max(signature.max_delta_w - signature.min_delta_w, 1.0)
    distance = abs(magnitude - midpoint)
    return round(max(0.35, min(0.95, 0.95 - distance / span)), 3)


def _reason(
    delta_w: float,
    signature: ApplianceSignature,
    matched: ApplianceSignature | None,
) -> str:
    if matched != signature:
        return "state carried from previous matching step"
    direction = "turn-on" if delta_w > 0 else "turn-off"
    return f"{direction} step matched {signature.appliance} power range"

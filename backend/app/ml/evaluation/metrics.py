from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean
from typing import Sequence


@dataclass(frozen=True)
class RegressionMetrics:
    mae_w: float
    rmse_w: float


@dataclass(frozen=True)
class ClassificationMetrics:
    precision: float
    recall: float
    f1_score: float
    true_positive: int
    false_positive: int
    true_negative: int
    false_negative: int


def mean_absolute_error(actual: Sequence[float], predicted: Sequence[float]) -> float:
    _validate_same_length(actual, predicted)
    if not actual:
        return 0.0
    return float(fmean(abs(left - right) for left, right in zip(actual, predicted)))


def root_mean_squared_error(actual: Sequence[float], predicted: Sequence[float]) -> float:
    _validate_same_length(actual, predicted)
    if not actual:
        return 0.0
    return float(fmean((left - right) ** 2 for left, right in zip(actual, predicted)) ** 0.5)


def regression_metrics(actual: Sequence[float], predicted: Sequence[float]) -> RegressionMetrics:
    return RegressionMetrics(
        mae_w=round(mean_absolute_error(actual, predicted), 3),
        rmse_w=round(root_mean_squared_error(actual, predicted), 3),
    )


def on_off_labels(values: Sequence[float], *, threshold_w: float) -> tuple[int, ...]:
    return tuple(1 if value >= threshold_w else 0 for value in values)


def classification_metrics(
    actual_labels: Sequence[int],
    predicted_labels: Sequence[int],
) -> ClassificationMetrics:
    _validate_same_length(actual_labels, predicted_labels)

    true_positive = sum(
        1 for actual, predicted in zip(actual_labels, predicted_labels) if actual == 1 and predicted == 1
    )
    false_positive = sum(
        1 for actual, predicted in zip(actual_labels, predicted_labels) if actual == 0 and predicted == 1
    )
    true_negative = sum(
        1 for actual, predicted in zip(actual_labels, predicted_labels) if actual == 0 and predicted == 0
    )
    false_negative = sum(
        1 for actual, predicted in zip(actual_labels, predicted_labels) if actual == 1 and predicted == 0
    )

    precision = _safe_divide(true_positive, true_positive + false_positive)
    recall = _safe_divide(true_positive, true_positive + false_negative)
    f1_score = _safe_divide(2 * precision * recall, precision + recall)

    return ClassificationMetrics(
        precision=round(precision, 3),
        recall=round(recall, 3),
        f1_score=round(f1_score, 3),
        true_positive=true_positive,
        false_positive=false_positive,
        true_negative=true_negative,
        false_negative=false_negative,
    )


def _safe_divide(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _validate_same_length(left: Sequence[object], right: Sequence[object]) -> None:
    if len(left) != len(right):
        raise ValueError("actual and predicted sequences must have the same length")

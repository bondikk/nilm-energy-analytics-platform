from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean, pstdev
from typing import Sequence


@dataclass(frozen=True)
class StandardScaler:
    mean: float
    std: float

    def transform(self, values: Sequence[float]) -> tuple[float, ...]:
        return tuple((value - self.mean) / self.std for value in values)

    def inverse_transform(self, values: Sequence[float]) -> tuple[float, ...]:
        return tuple(value * self.std + self.mean for value in values)


def fit_standard_scaler(values: Sequence[float]) -> StandardScaler:
    if not values:
        raise ValueError("cannot fit scaler on empty values")

    mean = float(fmean(values))
    std = float(pstdev(values)) or 1.0
    return StandardScaler(mean=mean, std=std)

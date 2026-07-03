from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Seq2PointModelSpec:
    appliance: str
    window_size: int = 599
    architecture: str = "cnn_seq2point"
    status: str = "planned"

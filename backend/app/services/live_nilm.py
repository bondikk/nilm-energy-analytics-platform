from __future__ import annotations

import uuid
from dataclasses import dataclass
from hashlib import sha1
from statistics import fmean, median

from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.schemas.live_nilm import (
    LiveNILMApplianceEstimateRead,
    LiveNILMCurrentRead,
    LiveNILMEventRead,
    LiveNILMReadingPointRead,
    LiveNILMSignalSummaryRead,
    LiveNILMSummaryRead,
)


_LIMITATIONS = [
    "Heuristic step-based online estimate; not a trained production NILM model.",
    "Overlapping appliances and sparse sampling can hide or merge events.",
    "Dataset-grade validation belongs in NILM Lab.",
]


@dataclass(frozen=True)
class _SignalPoint:
    metric: EnergyMetric
    power_w: float
    smoothed_power_w: float
    source_signal: str


@dataclass(frozen=True)
class _Signature:
    appliance: str
    label: str
    low_w: float
    high_w: float
    nominal_w: float
    explanation: str


_SIGNATURES = (
    _Signature(
        appliance="fridge",
        label="Fridge compressor",
        low_w=70,
        high_w=220,
        nominal_w=140,
        explanation="Small cyclic compressor-style step.",
    ),
    _Signature(
        appliance="washing_machine",
        label="Washing machine / dishwasher",
        low_w=300,
        high_w=900,
        nominal_w=600,
        explanation="Medium flexible load close to laundry or dishwasher ranges.",
    ),
    _Signature(
        appliance="microwave",
        label="Microwave",
        low_w=700,
        high_w=1450,
        nominal_w=1100,
        explanation="High short-cycle load close to microwave signatures.",
    ),
    _Signature(
        appliance="kettle",
        label="Kettle / resistive heater",
        low_w=1600,
        high_w=2800,
        nominal_w=2200,
        explanation="Large resistive step close to kettle or portable heater ranges.",
    ),
    _Signature(
        appliance="oven_heater",
        label="Oven / heater",
        low_w=1200,
        high_w=2600,
        nominal_w=1800,
        explanation="Sustained thermal load range.",
    ),
)


def analyze_live_nilm(
    *,
    home_id: uuid.UUID,
    device_id: uuid.UUID | None,
    metrics: list[EnergyMetric],
    min_step_w: float = 80.0,
) -> LiveNILMSummaryRead:
    points = _build_signal_points(sorted(metrics, key=lambda metric: metric.ts))
    events = _detect_events(points, min_step_w=min_step_w)
    current = _build_current(home_id=home_id, device_id=device_id, points=points, events=events)
    signal = _build_signal_summary(points=points, events=events)

    return LiveNILMSummaryRead(
        home_id=home_id,
        device_id=device_id,
        current=current,
        signal=signal,
        events=events[-80:],
        recent_points=[
            LiveNILMReadingPointRead(
                ts=point.metric.ts,
                power_w=round(point.power_w, 3),
                smoothed_power_w=round(point.smoothed_power_w, 3),
                voltage_v=point.metric.voltage_v,
                current_a=point.metric.current_a,
            )
            for point in points[-240:]
        ],
    )


def _build_signal_points(metrics: list[EnergyMetric]) -> list[_SignalPoint]:
    powers = [_extract_power(metric)[0] for metric in metrics]
    if not powers:
        return []

    smoothed_values: list[float] = []
    for index in range(len(powers)):
        start = max(0, index - 1)
        end = min(len(powers), index + 2)
        smoothed_values.append(float(median(powers[start:end])))

    return [
        _SignalPoint(
            metric=metric,
            power_w=power,
            smoothed_power_w=smoothed_values[index],
            source_signal=_extract_power(metric)[1],
        )
        for index, (metric, power) in enumerate(zip(metrics, powers, strict=True))
    ]


def _extract_power(metric: EnergyMetric) -> tuple[float, str]:
    if metric.active_power_w is not None:
        return float(metric.active_power_w), "active_power_w"
    if metric.apparent_power_va is not None:
        return float(metric.apparent_power_va), "apparent_power_va"
    if metric.voltage_v is not None and metric.current_a is not None:
        return float(metric.voltage_v) * float(metric.current_a), "voltage_current_estimate"
    return 0.0, "missing_power_signal"


def _detect_events(points: list[_SignalPoint], *, min_step_w: float) -> list[LiveNILMEventRead]:
    events: list[LiveNILMEventRead] = []
    open_turn_ons: list[LiveNILMEventRead] = []

    for before, after in zip(points, points[1:], strict=False):
        delta_w = after.smoothed_power_w - before.smoothed_power_w
        if abs(delta_w) < min_step_w:
            continue

        direction = "on" if delta_w > 0 else "off"
        signature = _classify_signature(abs(delta_w), direction=direction)
        event = LiveNILMEventRead(
            event_id=_event_id(after, delta_w, signature.appliance),
            ts=after.metric.ts,
            direction=direction,
            step_magnitude_w=round(abs(delta_w), 3),
            before_power_w=round(before.smoothed_power_w, 3),
            after_power_w=round(after.smoothed_power_w, 3),
            estimated_appliance=signature.appliance,
            confidence=round(_confidence(abs(delta_w), signature), 3),
            duration_seconds=None,
            source_signal=after.source_signal,
            explanation=(
                f"{signature.explanation} Step {direction} of about {round(abs(delta_w))} W "
                f"from {round(before.smoothed_power_w)} W to {round(after.smoothed_power_w)} W."
            ),
            limitations=list(_LIMITATIONS),
        )

        if direction == "on":
            open_turn_ons.append(event)
            events.append(event)
            continue

        match_index = _find_open_turn_on(open_turn_ons, event)
        if match_index is not None:
            turn_on = open_turn_ons.pop(match_index)
            duration_seconds = max(0, int((event.ts - turn_on.ts).total_seconds()))
            events = [
                previous.model_copy(update={"duration_seconds": duration_seconds})
                if previous.event_id == turn_on.event_id
                else previous
                for previous in events
            ]
        events.append(event)

    return events


def _classify_signature(magnitude_w: float, *, direction: str) -> _Signature:
    if direction == "off":
        return _Signature(
            appliance="load_turned_off",
            label="Load turned off",
            low_w=0,
            high_w=10_000,
            nominal_w=magnitude_w,
            explanation="A previous load likely turned off.",
        )

    best = min(
        _SIGNATURES,
        key=lambda signature: _range_distance(magnitude_w, signature.low_w, signature.high_w),
    )
    if _range_distance(magnitude_w, best.low_w, best.high_w) <= 350:
        return best
    return _Signature(
        appliance="unknown_load",
        label="Unknown load",
        low_w=0,
        high_w=10_000,
        nominal_w=magnitude_w,
        explanation="The step is visible but does not match a known signature range.",
    )


def _range_distance(value: float, low: float, high: float) -> float:
    if low <= value <= high:
        return 0.0
    return min(abs(value - low), abs(value - high))


def _confidence(magnitude_w: float, signature: _Signature) -> float:
    if signature.appliance in {"unknown_load", "load_turned_off"}:
        return min(0.72, 0.38 + magnitude_w / 4_000)
    center = (signature.low_w + signature.high_w) / 2
    half_range = max((signature.high_w - signature.low_w) / 2, 1)
    fit = max(0.0, 1.0 - abs(magnitude_w - center) / (half_range + 250))
    return min(0.94, 0.48 + fit * 0.42)


def _event_id(point: _SignalPoint, delta_w: float, appliance: str) -> str:
    raw = f"{point.metric.device_id}:{point.metric.ts.isoformat()}:{round(delta_w, 3)}:{appliance}"
    return sha1(raw.encode("utf-8")).hexdigest()[:16]


def _find_open_turn_on(
    open_turn_ons: list[LiveNILMEventRead],
    turn_off: LiveNILMEventRead,
) -> int | None:
    best_index: int | None = None
    best_distance: float | None = None
    for index, turn_on in enumerate(open_turn_ons):
        distance = abs(turn_on.step_magnitude_w - turn_off.step_magnitude_w)
        tolerance = max(120.0, turn_on.step_magnitude_w * 0.35)
        if distance > tolerance:
            continue
        if best_distance is None or distance < best_distance:
            best_index = index
            best_distance = distance
    return best_index


def _build_current(
    *,
    home_id: uuid.UUID,
    device_id: uuid.UUID | None,
    points: list[_SignalPoint],
    events: list[LiveNILMEventRead],
) -> LiveNILMCurrentRead:
    if not points:
        return LiveNILMCurrentRead(
            home_id=home_id,
            device_id=device_id,
            current_power_w=0,
            voltage_v=None,
            current_a=None,
            base_load_w=0,
            unknown_load_w=0,
            source_signal="missing_power_signal",
            latest_sample_at=None,
            appliance_estimates=[],
            last_event=None,
            limitations=list(_LIMITATIONS),
        )

    latest = points[-1]
    base_load_w = _base_load([point.power_w for point in points])
    active_events = _active_turn_on_events(events)
    estimates = [
        LiveNILMApplianceEstimateRead(
            appliance=event.estimated_appliance,
            label=_label_for_appliance(event.estimated_appliance),
            estimated_power_w=event.step_magnitude_w,
            confidence=event.confidence,
            state="active",
            source_event_id=event.event_id,
            explanation=event.explanation,
        )
        for event in active_events
    ]
    explained_load = sum(estimate.estimated_power_w for estimate in estimates)
    unknown_load_w = max(0.0, latest.power_w - base_load_w - explained_load)
    if unknown_load_w >= 60:
        estimates.append(
            LiveNILMApplianceEstimateRead(
                appliance="unknown_base_load",
                label="Unknown/base load",
                estimated_power_w=round(unknown_load_w, 3),
                confidence=0.42,
                state="observed",
                source_event_id=None,
                explanation="Remaining load after subtracting base load and active step estimates.",
            )
        )

    return LiveNILMCurrentRead(
        home_id=home_id,
        device_id=device_id,
        current_power_w=round(latest.power_w, 3),
        voltage_v=latest.metric.voltage_v,
        current_a=latest.metric.current_a,
        base_load_w=round(base_load_w, 3),
        unknown_load_w=round(unknown_load_w, 3),
        source_signal=latest.source_signal,
        latest_sample_at=latest.metric.ts,
        appliance_estimates=estimates[:6],
        last_event=events[-1] if events else None,
        limitations=list(_LIMITATIONS),
    )


def _active_turn_on_events(events: list[LiveNILMEventRead]) -> list[LiveNILMEventRead]:
    active: list[LiveNILMEventRead] = []
    for event in events:
        if event.direction == "on":
            active.append(event)
            continue
        match_index = _find_open_turn_on(active, event)
        if match_index is not None:
            active.pop(match_index)
    return active[-5:]


def _label_for_appliance(appliance: str) -> str:
    for signature in _SIGNATURES:
        if signature.appliance == appliance:
            return signature.label
    labels = {
        "unknown_load": "Unknown load",
        "unknown_base_load": "Unknown/base load",
        "load_turned_off": "Load turned off",
    }
    return labels.get(appliance, appliance.replace("_", " ").title())


def _build_signal_summary(
    *,
    points: list[_SignalPoint],
    events: list[LiveNILMEventRead],
) -> LiveNILMSignalSummaryRead:
    powers = [point.power_w for point in points]
    if not points:
        return LiveNILMSignalSummaryRead(
            sample_count=0,
            start_at=None,
            end_at=None,
            source_signal="missing_power_signal",
            min_power_w=None,
            mean_power_w=None,
            max_power_w=None,
            base_load_w=0,
            peak_to_base_w=0,
            step_count=0,
            voltage_estimated=False,
            quality_flags=["No recent telemetry samples."],
        )

    base_load = _base_load(powers)
    max_power = max(powers)
    source_signal = points[-1].source_signal
    voltage_estimated = any(
        isinstance(point.metric.raw_payload, dict)
        and bool(point.metric.raw_payload.get("voltage_fallback"))
        for point in points
    )
    quality_flags = []
    if len(points) < 12:
        quality_flags.append("Low sample count; estimates are less stable.")
    if source_signal != "active_power_w":
        quality_flags.append(f"Using {source_signal} because active power is missing.")
    if voltage_estimated:
        quality_flags.append("Some readings use estimated voltage.")
    if not quality_flags:
        quality_flags.append("Recent signal is usable for heuristic event detection.")

    return LiveNILMSignalSummaryRead(
        sample_count=len(points),
        start_at=points[0].metric.ts,
        end_at=points[-1].metric.ts,
        source_signal=source_signal,
        min_power_w=round(min(powers), 3),
        mean_power_w=round(float(fmean(powers)), 3),
        max_power_w=round(max_power, 3),
        base_load_w=round(base_load, 3),
        peak_to_base_w=round(max_power - base_load, 3),
        step_count=len(events),
        voltage_estimated=voltage_estimated,
        quality_flags=quality_flags,
    )


def _base_load(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(len(ordered) * 0.1)))
    return ordered[index]

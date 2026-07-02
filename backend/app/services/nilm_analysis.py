from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from statistics import fmean, median


class NILMEventType(StrEnum):
    TURN_ON = "turn_on"
    TURN_OFF = "turn_off"


class NILMSignature(StrEnum):
    FRIDGE_COMPRESSOR = "fridge_compressor"
    FLEXIBLE_APPLIANCE = "flexible_appliance"
    HVAC_OR_HEATER = "hvac_or_heater"
    LARGE_RESISTIVE_LOAD = "large_resistive_load"
    DEVICE_OFF = "device_off"
    UNKNOWN_LOAD = "unknown_load"


@dataclass(frozen=True)
class NILMReading:
    ts: datetime
    active_power_w: float


@dataclass(frozen=True)
class NILMDetectionConfig:
    min_step_w: float = 80.0
    smoothing_window: int = 3
    duplicate_gap_seconds: int = 45
    max_events: int = 100


@dataclass(frozen=True)
class NILMEvent:
    ts: datetime
    event_type: NILMEventType
    signature: NILMSignature
    delta_w: float
    before_w: float
    after_w: float
    confidence: float
    score: float
    description: str
    duration_seconds: int | None = None
    estimated_energy_wh: float | None = None


@dataclass(frozen=True)
class NILMSummary:
    sample_count: int
    event_count: int
    baseload_w: float | None
    average_power_w: float | None
    peak_power_w: float | None
    detected_load_w: float
    largest_step_w: float | None


@dataclass(frozen=True)
class NILMAnalysis:
    summary: NILMSummary
    events: list[NILMEvent]


@dataclass(frozen=True)
class _PowerStep:
    ts: datetime
    delta_w: float
    before_w: float
    after_w: float


def analyze_load_profile(
    readings: list[NILMReading],
    config: NILMDetectionConfig | None = None,
) -> NILMAnalysis:
    active_config = config or NILMDetectionConfig()
    clean_readings = sorted(readings, key=lambda reading: reading.ts)

    if len(clean_readings) < 2:
        return NILMAnalysis(
            summary=_build_summary(clean_readings, []),
            events=[],
        )

    smoothed = _smooth_readings(clean_readings, active_config.smoothing_window)
    steps = _detect_steps(smoothed, active_config)
    events = _classify_steps(steps, active_config.max_events)
    paired_events = _estimate_event_durations(events)

    return NILMAnalysis(
        summary=_build_summary(clean_readings, paired_events),
        events=paired_events,
    )


def _smooth_readings(readings: list[NILMReading], window: int) -> list[NILMReading]:
    if window <= 1:
        return readings

    radius = max(1, window // 2)
    smoothed: list[NILMReading] = []
    for index, reading in enumerate(readings):
        start = max(0, index - radius)
        end = min(len(readings), index + radius + 1)
        values = [candidate.active_power_w for candidate in readings[start:end]]
        smoothed.append(NILMReading(ts=reading.ts, active_power_w=float(median(values))))

    return smoothed


def _detect_steps(readings: list[NILMReading], config: NILMDetectionConfig) -> list[_PowerStep]:
    candidates: list[_PowerStep] = []
    for before, after in zip(readings, readings[1:]):
        delta_w = after.active_power_w - before.active_power_w
        if abs(delta_w) >= config.min_step_w:
            candidates.append(
                _PowerStep(
                    ts=after.ts,
                    delta_w=delta_w,
                    before_w=before.active_power_w,
                    after_w=after.active_power_w,
                )
            )

    return _deduplicate_steps(candidates, config.duplicate_gap_seconds)


def _deduplicate_steps(steps: list[_PowerStep], duplicate_gap_seconds: int) -> list[_PowerStep]:
    if duplicate_gap_seconds <= 0:
        return steps

    deduplicated: list[_PowerStep] = []
    for step in steps:
        if not deduplicated:
            deduplicated.append(step)
            continue

        previous = deduplicated[-1]
        seconds_since_previous = (step.ts - previous.ts).total_seconds()
        same_direction = (step.delta_w >= 0) == (previous.delta_w >= 0)
        if same_direction and seconds_since_previous <= duplicate_gap_seconds:
            if abs(step.delta_w) > abs(previous.delta_w):
                deduplicated[-1] = step
            continue

        deduplicated.append(step)

    return deduplicated


def _classify_steps(steps: list[_PowerStep], max_events: int) -> list[NILMEvent]:
    events = [_classify_step(step) for step in steps]
    events.sort(key=lambda event: (event.ts, -abs(event.delta_w)))
    return events[:max_events]


def _classify_step(step: _PowerStep) -> NILMEvent:
    magnitude = abs(step.delta_w)
    event_type = NILMEventType.TURN_ON if step.delta_w > 0 else NILMEventType.TURN_OFF
    signature = _classify_signature(step.delta_w)
    confidence = _confidence_for_step(magnitude, signature)
    score = min(1.0, magnitude / max(abs(step.after_w), abs(step.before_w), 1.0))

    return NILMEvent(
        ts=step.ts,
        event_type=event_type,
        signature=signature,
        delta_w=round(step.delta_w, 3),
        before_w=round(step.before_w, 3),
        after_w=round(step.after_w, 3),
        confidence=round(confidence, 3),
        score=round(score, 3),
        description=_describe_event(event_type, signature, magnitude),
    )


def _classify_signature(delta_w: float) -> NILMSignature:
    magnitude = abs(delta_w)
    if delta_w < 0:
        return NILMSignature.DEVICE_OFF
    if magnitude < 180:
        return NILMSignature.FRIDGE_COMPRESSOR
    if magnitude < 700:
        return NILMSignature.FLEXIBLE_APPLIANCE
    if magnitude < 1800:
        return NILMSignature.HVAC_OR_HEATER
    if magnitude >= 1800:
        return NILMSignature.LARGE_RESISTIVE_LOAD
    return NILMSignature.UNKNOWN_LOAD


def _confidence_for_step(magnitude: float, signature: NILMSignature) -> float:
    confidence = 0.45 + min(0.45, magnitude / 2_500)
    if signature in {NILMSignature.UNKNOWN_LOAD, NILMSignature.DEVICE_OFF}:
        confidence -= 0.08
    return max(0.1, min(0.95, confidence))


def _describe_event(
    event_type: NILMEventType,
    signature: NILMSignature,
    magnitude: float,
) -> str:
    rounded_watts = round(magnitude)
    if event_type == NILMEventType.TURN_OFF:
        return f"Load dropped by {rounded_watts} W; likely a device turning off."

    descriptions = {
        NILMSignature.FRIDGE_COMPRESSOR: "Small cyclic load detected; likely compressor-style appliance.",
        NILMSignature.FLEXIBLE_APPLIANCE: "Medium flexible load detected; likely laundry or dishwasher cycle.",
        NILMSignature.HVAC_OR_HEATER: "High-load thermal event detected; likely HVAC, heater, or AC.",
        NILMSignature.LARGE_RESISTIVE_LOAD: "Very large resistive load detected; likely oven, kettle, or dryer.",
        NILMSignature.UNKNOWN_LOAD: "Unclassified load edge detected.",
        NILMSignature.DEVICE_OFF: "Load edge detected.",
    }
    return f"{descriptions[signature]} Step size: {rounded_watts} W."


def _estimate_event_durations(events: list[NILMEvent]) -> list[NILMEvent]:
    paired_events = list(events)
    open_turn_on_indexes: list[int] = []

    for index, event in enumerate(paired_events):
        if event.event_type == NILMEventType.TURN_ON:
            open_turn_on_indexes.append(index)
            continue

        match_index = _find_matching_turn_on(paired_events, open_turn_on_indexes, event)
        if match_index is None:
            continue

        open_turn_on_indexes.remove(match_index)
        turn_on_event = paired_events[match_index]
        duration_seconds = max(0, int((event.ts - turn_on_event.ts).total_seconds()))
        estimated_energy_wh = abs(turn_on_event.delta_w) * duration_seconds / 3600
        paired_events[match_index] = replace(
            turn_on_event,
            duration_seconds=duration_seconds,
            estimated_energy_wh=round(estimated_energy_wh, 3),
        )

    return paired_events


def _find_matching_turn_on(
    events: list[NILMEvent],
    open_turn_on_indexes: list[int],
    turn_off_event: NILMEvent,
) -> int | None:
    best_index: int | None = None
    best_distance: float | None = None

    for index in reversed(open_turn_on_indexes):
        turn_on_event = events[index]
        magnitude_distance = abs(abs(turn_on_event.delta_w) - abs(turn_off_event.delta_w))
        tolerance = max(120.0, abs(turn_on_event.delta_w) * 0.35)
        if magnitude_distance > tolerance:
            continue
        if best_distance is None or magnitude_distance < best_distance:
            best_index = index
            best_distance = magnitude_distance

    return best_index


def _build_summary(readings: list[NILMReading], events: list[NILMEvent]) -> NILMSummary:
    values = [reading.active_power_w for reading in readings]
    if not values:
        return NILMSummary(
            sample_count=0,
            event_count=0,
            baseload_w=None,
            average_power_w=None,
            peak_power_w=None,
            detected_load_w=0.0,
            largest_step_w=None,
        )

    positive_steps = [event.delta_w for event in events if event.delta_w > 0]
    largest_step = max((abs(event.delta_w) for event in events), default=None)

    return NILMSummary(
        sample_count=len(readings),
        event_count=len(events),
        baseload_w=round(_percentile(values, 0.1), 3),
        average_power_w=round(float(fmean(values)), 3),
        peak_power_w=round(max(values), 3),
        detected_load_w=round(sum(positive_steps), 3),
        largest_step_w=round(largest_step, 3) if largest_step is not None else None,
    )


def _percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]

    bounded_fraction = max(0.0, min(1.0, fraction))
    rank = bounded_fraction * (len(ordered) - 1)
    lower_index = int(rank)
    upper_index = min(lower_index + 1, len(ordered) - 1)
    weight = rank - lower_index

    return ordered[lower_index] * (1 - weight) + ordered[upper_index] * weight

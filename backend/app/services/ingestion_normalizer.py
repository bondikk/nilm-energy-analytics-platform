from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Any


NATIVE_INGESTION_FIELDS = {
    "ts",
    "device_external_id",
    "device_id",
    "home_id",
    "voltage_v",
    "current_a",
    "active_power_w",
    "reactive_power_var",
    "apparent_power_va",
    "power_factor",
    "frequency_hz",
    "energy_wh_delta",
    "raw_payload",
}


LEGACY_FIELD_MAP = {
    "timestamp": "ts",
    "i_rms": "current_a",
    "v_rms": "voltage_v",
    "s_est_va": "apparent_power_va",
}


def normalize_ingestion_payload(raw_payload: Mapping[str, Any]) -> dict[str, Any]:
    """Map known legacy firmware payloads into the native VoltPulse schema."""
    original = dict(raw_payload)
    normalized = {
        key: value
        for key, value in original.items()
        if key in NATIVE_INGESTION_FIELDS
    }

    for legacy_key, native_key in LEGACY_FIELD_MAP.items():
        if native_key not in normalized and legacy_key in original:
            normalized[native_key] = original[legacy_key]

    device_id = normalized.get("device_id")
    if device_id is not None and not _is_uuid_like(device_id):
        normalized.pop("device_id", None)
        normalized.setdefault("device_external_id", str(device_id).strip())

    if "raw_payload" not in normalized:
        normalized["raw_payload"] = original

    return normalized


def _is_uuid_like(value: object) -> bool:
    if isinstance(value, uuid.UUID):
        return True
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True

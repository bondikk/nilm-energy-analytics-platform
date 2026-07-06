import json
import uuid
from datetime import UTC, datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.ingestion_normalizer import normalize_ingestion_payload


class IngestionMetricPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ts: datetime
    device_external_id: str | None = Field(default=None, min_length=1, max_length=128)
    device_id: uuid.UUID | None = None
    home_id: uuid.UUID | None = None
    voltage_v: float | None = Field(default=None, ge=0)
    current_a: float | None = Field(default=None, ge=0)
    active_power_w: float | None = None
    reactive_power_var: float | None = None
    apparent_power_va: float | None = None
    power_factor: float | None = Field(default=None, ge=-1, le=1)
    frequency_hz: float | None = None
    energy_wh_delta: float | None = None
    raw_payload: dict[str, object] | None = None

    @field_validator("ts")
    @classmethod
    def ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value

    @field_validator("device_external_id")
    @classmethod
    def strip_external_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("device_external_id must not be blank")
        return stripped

    @model_validator(mode="after")
    def require_device_identifier(self) -> Self:
        if self.device_id is None and self.device_external_id is None:
            raise ValueError("device_id or device_external_id is required")
        return self

    def to_stream_fields(self) -> dict[str, str]:
        return {
            "schema_version": "1",
            "payload": self.model_dump_json(),
        }

    @classmethod
    def from_stream_fields(cls, fields: dict[str, bytes | str]) -> Self:
        payload = fields.get("payload")
        if payload is None:
            raise ValueError("stream message is missing payload")
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")
        return cls.model_validate_json(payload)


class IngestionStreamMessage(BaseModel):
    stream_id: str
    payload: IngestionMetricPayload


def parse_ingestion_payload(raw_payload: bytes | str) -> IngestionMetricPayload:
    raw_text = raw_payload.decode("utf-8") if isinstance(raw_payload, bytes) else raw_payload
    parsed = json.loads(raw_text)
    if not isinstance(parsed, dict):
        raise ValueError("ingestion payload must be a JSON object")

    normalized = normalize_ingestion_payload(parsed)
    return IngestionMetricPayload.model_validate(normalized)

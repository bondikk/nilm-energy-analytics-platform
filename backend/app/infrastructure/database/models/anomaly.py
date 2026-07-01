import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.infrastructure.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AnomalyType(StrEnum):
    POWER_SPIKE = "power_spike"
    LONG_RUNNING_LOAD = "long_running_load"
    UNUSUAL_BASELOAD = "unusual_baseload"
    DEVICE_SIGNATURE_MISMATCH = "device_signature_mismatch"


class AnomalySeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AnomalyStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class Anomaly(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "anomalies"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("homes.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    device_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    anomaly_type: Mapped[AnomalyType] = mapped_column(
        Enum(AnomalyType, native_enum=False, length=64),
        nullable=False,
    )

    severity: Mapped[AnomalySeverity] = mapped_column(
        Enum(AnomalySeverity, native_enum=False, length=32),
        default=AnomalySeverity.MEDIUM,
        nullable=False,
    )

    status: Mapped[AnomalyStatus] = mapped_column(
        Enum(AnomalyStatus, native_enum=False, length=32),
        default=AnomalyStatus.OPEN,
        nullable=False,
    )

    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)

    metadata_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DeviceType(StrEnum):
    SMART_METER = "smart_meter"
    SIMULATED_METER = "simulated_meter"
    GATEWAY = "gateway"


class DeviceStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class Device(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "devices"

    home_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("homes.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    device_type: Mapped[DeviceType] = mapped_column(
        Enum(DeviceType, native_enum=False, length=32),
        default=DeviceType.SIMULATED_METER,
        nullable=False,
    )

    status: Mapped[DeviceStatus] = mapped_column(
        Enum(DeviceStatus, native_enum=False, length=32),
        default=DeviceStatus.ACTIVE,
        nullable=False,
    )

    firmware_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sampling_rate_hz: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    home = relationship("Home", back_populates="devices")

    __table_args__ = (
        UniqueConstraint("home_id", "external_id", name="uq_devices_home_external_id"),
    )

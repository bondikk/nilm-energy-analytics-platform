import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class EnergyMetric(Base):
    __tablename__ = "energy_metrics"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        nullable=False,
    )

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

    voltage_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_a: Mapped[float | None] = mapped_column(Float, nullable=True)

    active_power_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    reactive_power_var: Mapped[float | None] = mapped_column(Float, nullable=True)
    apparent_power_va: Mapped[float | None] = mapped_column(Float, nullable=True)
    power_factor: Mapped[float | None] = mapped_column(Float, nullable=True)

    frequency_hz: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_wh_delta: Mapped[float | None] = mapped_column(Float, nullable=True)

    raw_payload: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint("voltage_v IS NULL OR voltage_v >= 0", name="voltage_non_negative"),
        CheckConstraint("current_a IS NULL OR current_a >= 0", name="current_non_negative"),
        CheckConstraint(
            "power_factor IS NULL OR power_factor BETWEEN -1 AND 1",
            name="power_factor_range",
        ),
        Index("ix_energy_metrics_device_ts", "device_id", "ts"),
        Index("ix_energy_metrics_home_ts", "home_id", "ts"),
        Index("ix_energy_metrics_user_ts", "user_id", "ts"),
    )

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.infrastructure.database.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Home(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "homes"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Bratislava", nullable=False)
    location_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    owner = relationship("User", back_populates="homes")

    devices = relationship(
        "Device",
        back_populates="home",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
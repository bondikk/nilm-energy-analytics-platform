
"""initial schema

Revision ID: 20260701_0001
Revises:
Create Date: 2026-07-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "20260701_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "homes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Europe/Bratislava"),
        sa.Column("location_label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE", name="fk_homes_owner_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_homes"),
    )
    op.create_index("ix_homes_owner_id", "homes", ["owner_id"])

    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("device_type", sa.String(length=32), nullable=False, server_default="simulated_meter"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("firmware_version", sa.String(length=64), nullable=True),
        sa.Column("sampling_rate_hz", sa.Float(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["home_id"], ["homes.id"], ondelete="CASCADE", name="fk_devices_home_id_homes"),
        sa.PrimaryKeyConstraint("id", name="pk_devices"),
        sa.UniqueConstraint("home_id", "external_id", name="uq_devices_home_external_id"),
    )
    op.create_index("ix_devices_home_id", "devices", ["home_id"])

    op.create_table(
        "energy_metrics",
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("voltage_v", sa.Float(), nullable=True),
        sa.Column("current_a", sa.Float(), nullable=True),
        sa.Column("active_power_w", sa.Float(), nullable=True),
        sa.Column("reactive_power_var", sa.Float(), nullable=True),
        sa.Column("apparent_power_va", sa.Float(), nullable=True),
        sa.Column("power_factor", sa.Float(), nullable=True),
        sa.Column("frequency_hz", sa.Float(), nullable=True),
        sa.Column("energy_wh_delta", sa.Float(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.CheckConstraint("voltage_v IS NULL OR voltage_v >= 0", name="ck_energy_metrics_voltage_non_negative"),
        sa.CheckConstraint("current_a IS NULL OR current_a >= 0", name="ck_energy_metrics_current_non_negative"),
        sa.CheckConstraint("power_factor IS NULL OR power_factor BETWEEN -1 AND 1", name="ck_energy_metrics_power_factor_range"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="CASCADE", name="fk_energy_metrics_device_id_devices"),
        sa.ForeignKeyConstraint(["home_id"], ["homes.id"], ondelete="CASCADE", name="fk_energy_metrics_home_id_homes"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_energy_metrics_user_id_users"),
        sa.PrimaryKeyConstraint("device_id", "ts", name="pk_energy_metrics"),
    )

    op.execute(
        "SELECT create_hypertable('energy_metrics', 'ts', if_not_exists => TRUE)"
    )

    op.create_index("ix_energy_metrics_device_ts", "energy_metrics", ["device_id", "ts"])
    op.create_index("ix_energy_metrics_home_ts", "energy_metrics", ["home_id", "ts"])
    op.create_index("ix_energy_metrics_user_ts", "energy_metrics", ["user_id", "ts"])

    op.create_table(
        "anomalies",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("anomaly_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="SET NULL", name="fk_anomalies_device_id_devices"),
        sa.ForeignKeyConstraint(["home_id"], ["homes.id"], ondelete="CASCADE", name="fk_anomalies_home_id_homes"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE", name="fk_anomalies_user_id_users"),
        sa.PrimaryKeyConstraint("id", name="pk_anomalies"),
    )
    op.create_index("ix_anomalies_user_id", "anomalies", ["user_id"])
    op.create_index("ix_anomalies_home_id", "anomalies", ["home_id"])
    op.create_index("ix_anomalies_device_id", "anomalies", ["device_id"])


def downgrade() -> None:
    op.drop_index("ix_anomalies_device_id", table_name="anomalies")
    op.drop_index("ix_anomalies_home_id", table_name="anomalies")
    op.drop_index("ix_anomalies_user_id", table_name="anomalies")
    op.drop_table("anomalies")

    op.drop_index("ix_energy_metrics_user_ts", table_name="energy_metrics")
    op.drop_index("ix_energy_metrics_home_ts", table_name="energy_metrics")
    op.drop_index("ix_energy_metrics_device_ts", table_name="energy_metrics")
    op.drop_table("energy_metrics")

    op.drop_index("ix_devices_home_id", table_name="devices")
    op.drop_table("devices")

    op.drop_index("ix_homes_owner_id", table_name="homes")
    op.drop_table("homes")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import pi, sin

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.infrastructure.database.models.anomaly import (
    Anomaly,
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
)
from app.infrastructure.database.models.device import Device, DeviceStatus, DeviceType
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.models.user import User


DEMO_EMAIL = "demo@voltpulse.local"
DEMO_PASSWORD = "demo-password"
DEMO_HOME_NAME = "Demo Apartment"
DEMO_DEVICE_EXTERNAL_ID = "demo-main-meter"


@dataclass(frozen=True)
class DemoMetricSample:
    ts: datetime
    voltage_v: float
    current_a: float
    active_power_w: float
    reactive_power_var: float
    apparent_power_va: float
    power_factor: float
    frequency_hz: float
    energy_wh_delta: float
    raw_payload: dict[str, object]


@dataclass(frozen=True)
class DemoSeedResult:
    email: str
    password: str
    user_id: uuid.UUID
    home_id: uuid.UUID
    device_id: uuid.UUID
    metric_count: int
    anomaly_count: int


def build_demo_metric_samples(
    start_at: datetime,
    sample_count: int = 96,
    interval_minutes: int = 15,
) -> list[DemoMetricSample]:
    if start_at.tzinfo is None:
        raise ValueError("start_at must be timezone-aware")
    if sample_count < 1:
        raise ValueError("sample_count must be positive")
    if interval_minutes < 1:
        raise ValueError("interval_minutes must be positive")

    normalized_start = start_at.astimezone(UTC)
    samples: list[DemoMetricSample] = []
    energy_hours = interval_minutes / 60

    for index in range(sample_count):
        day_fraction = index / sample_count
        morning_peak = 520 * _peak(day_fraction, center=0.30, width=0.08)
        evening_peak = 920 * _peak(day_fraction, center=0.75, width=0.10)
        background_wave = 90 * sin(2 * pi * day_fraction * 3)
        active_power_w = round(360 + morning_peak + evening_peak + background_wave, 2)
        voltage_v = round(230 + 2.5 * sin(2 * pi * day_fraction * 2), 2)
        power_factor = round(0.90 + 0.04 * sin(2 * pi * day_fraction), 3)
        current_a = round(active_power_w / (voltage_v * power_factor), 3)
        apparent_power_va = round(active_power_w / power_factor, 2)
        reactive_power_var = round((apparent_power_va**2 - active_power_w**2) ** 0.5, 2)

        samples.append(
            DemoMetricSample(
                ts=normalized_start + timedelta(minutes=index * interval_minutes),
                voltage_v=voltage_v,
                current_a=current_a,
                active_power_w=active_power_w,
                reactive_power_var=reactive_power_var,
                apparent_power_va=apparent_power_va,
                power_factor=power_factor,
                frequency_hz=50.0,
                energy_wh_delta=round(active_power_w * energy_hours, 2),
                raw_payload={
                    "source": "demo_seed",
                    "sequence": index,
                },
            )
        )

    return samples


async def seed_demo_data(
    session: AsyncSession,
    email: str = DEMO_EMAIL,
    password: str = DEMO_PASSWORD,
    sample_count: int = 96,
    interval_minutes: int = 15,
    start_at: datetime | None = None,
) -> DemoSeedResult:
    metric_start = start_at or datetime.now(UTC) - timedelta(hours=24)
    samples = build_demo_metric_samples(
        start_at=metric_start,
        sample_count=sample_count,
        interval_minutes=interval_minutes,
    )

    user = await _get_or_create_demo_user(session, email=email, password=password)
    home = await _get_or_create_demo_home(session, user=user)
    device = await _get_or_create_demo_device(session, home=home)

    await session.execute(delete(EnergyMetric).where(EnergyMetric.device_id == device.id))
    await session.execute(
        delete(Anomaly).where(
            Anomaly.home_id == home.id,
            Anomaly.device_id == device.id,
            Anomaly.title.like("Demo:%"),
        )
    )

    for sample in samples:
        session.add(
            EnergyMetric(
                device_id=device.id,
                ts=sample.ts,
                user_id=user.id,
                home_id=home.id,
                voltage_v=sample.voltage_v,
                current_a=sample.current_a,
                active_power_w=sample.active_power_w,
                reactive_power_var=sample.reactive_power_var,
                apparent_power_va=sample.apparent_power_va,
                power_factor=sample.power_factor,
                frequency_hz=sample.frequency_hz,
                energy_wh_delta=sample.energy_wh_delta,
                raw_payload=sample.raw_payload,
            )
        )

    spike_sample = max(samples, key=lambda sample: sample.active_power_w)
    session.add(
        Anomaly(
            user_id=user.id,
            home_id=home.id,
            device_id=device.id,
            anomaly_type=AnomalyType.POWER_SPIKE,
            severity=AnomalySeverity.MEDIUM,
            status=AnomalyStatus.OPEN,
            detected_at=spike_sample.ts,
            title="Demo: evening power spike",
            description="Synthetic anomaly generated from the demo load profile.",
            score=0.82,
            metadata_json={
                "source": "demo_seed",
                "active_power_w": spike_sample.active_power_w,
            },
        )
    )

    await session.commit()

    return DemoSeedResult(
        email=email,
        password=password,
        user_id=user.id,
        home_id=home.id,
        device_id=device.id,
        metric_count=len(samples),
        anomaly_count=1,
    )


async def _get_or_create_demo_user(session: AsyncSession, email: str, password: str) -> User:
    normalized_email = email.strip().lower()
    user = await session.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        user = User(
            email=normalized_email,
            hashed_password=get_password_hash(password),
            full_name="Demo Owner",
        )
        session.add(user)
    else:
        user.hashed_password = get_password_hash(password)
        user.full_name = user.full_name or "Demo Owner"
        user.is_active = True

    await session.flush()
    return user


async def _get_or_create_demo_home(session: AsyncSession, user: User) -> Home:
    home = await session.scalar(
        select(Home).where(
            Home.owner_id == user.id,
            Home.name == DEMO_HOME_NAME,
        )
    )
    if home is None:
        home = Home(
            owner_id=user.id,
            name=DEMO_HOME_NAME,
            timezone="Europe/Bratislava",
            location_label="Bratislava",
        )
        session.add(home)
    else:
        home.timezone = "Europe/Bratislava"
        home.location_label = "Bratislava"

    await session.flush()
    return home


async def _get_or_create_demo_device(session: AsyncSession, home: Home) -> Device:
    device = await session.scalar(
        select(Device).where(
            Device.home_id == home.id,
            Device.external_id == DEMO_DEVICE_EXTERNAL_ID,
        )
    )
    if device is None:
        device = Device(
            home_id=home.id,
            external_id=DEMO_DEVICE_EXTERNAL_ID,
            name="Main Smart Meter",
            device_type=DeviceType.SMART_METER,
            status=DeviceStatus.ACTIVE,
            firmware_version="demo-1.0.0",
            sampling_rate_hz=1 / 900,
        )
        session.add(device)
    else:
        device.name = "Main Smart Meter"
        device.device_type = DeviceType.SMART_METER
        device.status = DeviceStatus.ACTIVE
        device.firmware_version = "demo-1.0.0"
        device.sampling_rate_hz = 1 / 900

    await session.flush()
    return device


def _peak(day_fraction: float, center: float, width: float) -> float:
    distance = (day_fraction - center) / width
    return max(0.0, 1 - distance * distance)

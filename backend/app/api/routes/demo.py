from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import settings
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_db_session
from app.schemas.demo import (
    DemoLiveMetricRequest,
    DemoLiveMetricResponse,
    DemoSeedRequest,
    DemoSeedResponse,
)
from app.schemas.ingestion import IngestionMetricPayload
from app.services.demo_data import seed_demo_data
from app.services.mqtt_publisher import MQTTMetricPublisher, build_metric_topic


router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/seed", response_model=DemoSeedResponse)
async def seed_demo_dataset(
    payload: DemoSeedRequest,
    session: AsyncSession = Depends(get_db_session),
) -> DemoSeedResponse:
    if settings.environment.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo seeding is disabled in production",
        )

    start_at = payload.start_at
    if start_at is not None and start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=UTC)

    result = await seed_demo_data(
        session=session,
        email=payload.email,
        password=payload.password,
        sample_count=payload.sample_count,
        interval_minutes=payload.interval_minutes,
        start_at=start_at,
    )

    return DemoSeedResponse(
        email=result.email,
        password=result.password,
        user_id=result.user_id,
        home_id=result.home_id,
        device_id=result.device_id,
        metric_count=result.metric_count,
        anomaly_count=result.anomaly_count,
    )


@router.post("/live-metric", response_model=DemoLiveMetricResponse)
async def publish_live_demo_metric(
    payload: DemoLiveMetricRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DemoLiveMetricResponse:
    if settings.environment.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Live demo publishing is disabled in production",
        )

    device = await session.scalar(
        select(Device)
        .join(Home, Device.home_id == Home.id)
        .where(
            Home.id == payload.home_id,
            Home.owner_id == current_user.id,
            Device.id == payload.device_id,
        )
    )
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )

    metric_payload = build_live_metric_payload(payload, device)
    topic = build_metric_topic(device.external_id)
    publisher = MQTTMetricPublisher()
    try:
        await publisher.publish_metric(topic, metric_payload.model_dump_json())
    except (ConnectionError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MQTT broker is not available",
        ) from exc

    return DemoLiveMetricResponse(
        published=True,
        topic=topic,
        home_id=payload.home_id,
        device_id=payload.device_id,
        device_external_id=device.external_id,
        ts=metric_payload.ts,
        active_power_w=metric_payload.active_power_w or 0,
        voltage_v=metric_payload.voltage_v or 0,
        current_a=metric_payload.current_a or 0,
        energy_wh_delta=metric_payload.energy_wh_delta or 0,
        scenario=payload.scenario,
    )


def build_live_metric_payload(
    payload: DemoLiveMetricRequest,
    device: Device,
) -> IngestionMetricPayload:
    ts = payload.ts or datetime.now(UTC)
    current_a = payload.current_a
    if current_a is None:
        denominator = payload.voltage_v * payload.power_factor
        current_a = payload.active_power_w / denominator if denominator > 0 else 0

    energy_wh_delta = payload.energy_wh_delta
    if energy_wh_delta is None:
        energy_wh_delta = payload.active_power_w * (payload.interval_minutes / 60)

    return IngestionMetricPayload(
        ts=ts,
        device_external_id=device.external_id,
        device_id=device.id,
        home_id=device.home_id,
        voltage_v=payload.voltage_v,
        current_a=round(current_a, 3),
        active_power_w=payload.active_power_w,
        power_factor=payload.power_factor,
        energy_wh_delta=round(energy_wh_delta, 3),
        raw_payload={
            "source": "live_mqtt_simulator",
            "scenario": payload.scenario,
            "device_external_id": device.external_id,
        },
    )

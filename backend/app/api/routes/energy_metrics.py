from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.devices import get_home_device
from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.energy_metric import EnergyMetricCreate, EnergyMetricRead


router = APIRouter(
    prefix="/homes/{home_id}/devices/{device_id}/metrics",
    tags=["energy-metrics"],
)


@router.post("", response_model=EnergyMetricRead, status_code=status.HTTP_201_CREATED)
async def create_energy_metric(
    payload: EnergyMetricCreate,
    home: Annotated[Home, Depends(get_current_user_home)],
    device: Annotated[Device, Depends(get_home_device)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> EnergyMetric:
    metric = EnergyMetric(
        device_id=device.id,
        ts=payload.ts,
        user_id=home.owner_id,
        home_id=home.id,
        voltage_v=payload.voltage_v,
        current_a=payload.current_a,
        active_power_w=payload.active_power_w,
        reactive_power_var=payload.reactive_power_var,
        apparent_power_va=payload.apparent_power_va,
        power_factor=payload.power_factor,
        frequency_hz=payload.frequency_hz,
        energy_wh_delta=payload.energy_wh_delta,
        raw_payload=payload.raw_payload,
    )
    session.add(metric)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Metric already exists for this device timestamp or violates constraints",
        ) from exc

    await session.refresh(metric)

    return metric


@router.get("", response_model=list[EnergyMetricRead])
async def list_energy_metrics(
    device: Annotated[Device, Depends(get_home_device)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> list[EnergyMetric]:
    statement = select(EnergyMetric).where(EnergyMetric.device_id == device.id)
    if start is not None:
        statement = statement.where(EnergyMetric.ts >= start)
    if end is not None:
        statement = statement.where(EnergyMetric.ts <= end)

    result = await session.scalars(statement.order_by(EnergyMetric.ts.desc()).limit(limit))

    return list(result)

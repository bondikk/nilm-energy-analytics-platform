import uuid
from datetime import datetime
from typing import Annotated, SupportsFloat

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.analytics import EnergySummaryRead


router = APIRouter(prefix="/homes/{home_id}/analytics", tags=["analytics"])


def optional_float(value: SupportsFloat | None) -> float | None:
    if value is None:
        return None
    return float(value)


async def validate_device_scope(
    device_id: uuid.UUID,
    home_id: uuid.UUID,
    session: AsyncSession,
) -> None:
    existing_device_id = await session.scalar(
        select(Device.id).where(
            Device.id == device_id,
            Device.home_id == home_id,
        )
    )
    if existing_device_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )


@router.get("/summary", response_model=EnergySummaryRead)
async def get_energy_summary(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    device_id: uuid.UUID | None = None,
) -> EnergySummaryRead:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start must be before end",
        )

    statement = select(
        func.count(EnergyMetric.ts).label("sample_count"),
        func.sum(EnergyMetric.energy_wh_delta).label("energy_wh_delta_total"),
        func.avg(EnergyMetric.active_power_w).label("active_power_w_avg"),
        func.min(EnergyMetric.active_power_w).label("active_power_w_min"),
        func.max(EnergyMetric.active_power_w).label("active_power_w_max"),
        func.avg(EnergyMetric.current_a).label("current_a_avg"),
        func.avg(EnergyMetric.voltage_v).label("voltage_v_avg"),
    ).where(EnergyMetric.home_id == home.id)

    if device_id is not None:
        await validate_device_scope(device_id, home.id, session)
        statement = statement.where(EnergyMetric.device_id == device_id)
    if start is not None:
        statement = statement.where(EnergyMetric.ts >= start)
    if end is not None:
        statement = statement.where(EnergyMetric.ts <= end)

    row = (await session.execute(statement)).one()

    return EnergySummaryRead(
        home_id=home.id,
        device_id=device_id,
        start=start,
        end=end,
        sample_count=int(row.sample_count or 0),
        energy_wh_delta_total=optional_float(row.energy_wh_delta_total),
        active_power_w_avg=optional_float(row.active_power_w_avg),
        active_power_w_min=optional_float(row.active_power_w_min),
        active_power_w_max=optional_float(row.active_power_w_max),
        current_a_avg=optional_float(row.current_a_avg),
        voltage_v_avg=optional_float(row.voltage_v_avg),
    )

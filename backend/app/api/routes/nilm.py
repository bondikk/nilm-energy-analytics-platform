import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.nilm import NILMAnalysisRead
from app.services.nilm_analysis import NILMDetectionConfig, NILMReading, analyze_load_profile


router = APIRouter(prefix="/homes/{home_id}/nilm", tags=["nilm"])


async def validate_nilm_device_scope(
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


@router.get("/analysis", response_model=NILMAnalysisRead)
async def get_nilm_analysis(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=2, le=5000)] = 1000,
    min_step_w: Annotated[float, Query(ge=10, le=5000)] = 80.0,
) -> NILMAnalysisRead:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start must be before end",
        )

    statement = select(EnergyMetric).where(
        EnergyMetric.home_id == home.id,
        EnergyMetric.active_power_w.is_not(None),
    )
    if device_id is not None:
        await validate_nilm_device_scope(device_id, home.id, session)
        statement = statement.where(EnergyMetric.device_id == device_id)
    if start is not None:
        statement = statement.where(EnergyMetric.ts >= start)
    if end is not None:
        statement = statement.where(EnergyMetric.ts <= end)

    result = await session.scalars(statement.order_by(EnergyMetric.ts.desc()).limit(limit))
    readings = sorted(
        (
            NILMReading(ts=metric.ts, active_power_w=float(metric.active_power_w))
            for metric in result
            if metric.active_power_w is not None
        ),
        key=lambda reading: reading.ts,
    )
    analysis = analyze_load_profile(
        readings,
        config=NILMDetectionConfig(min_step_w=min_step_w),
    )

    return NILMAnalysisRead.from_domain(
        home_id=home.id,
        device_id=device_id,
        start=start,
        end=end,
        min_step_w=min_step_w,
        analysis=analysis,
    )

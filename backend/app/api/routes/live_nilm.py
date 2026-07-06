import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.live_nilm import (
    LiveNILMCurrentRead,
    LiveNILMEventRead,
    LiveNILMSummaryRead,
)
from app.services.live_nilm import analyze_live_nilm


router = APIRouter(prefix="/homes/{home_id}/live-nilm", tags=["live-nilm"])


async def validate_live_nilm_device_scope(
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


@router.get("/summary", response_model=LiveNILMSummaryRead)
async def get_live_nilm_summary(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=12, le=1000)] = 500,
    min_step_w: Annotated[float, Query(ge=20, le=5000)] = 80.0,
) -> LiveNILMSummaryRead:
    if device_id is not None:
        await validate_live_nilm_device_scope(device_id, home.id, session)

    metrics = await _load_recent_metrics(
        home_id=home.id,
        device_id=device_id,
        session=session,
        limit=limit,
    )
    return analyze_live_nilm(
        home_id=home.id,
        device_id=device_id,
        metrics=metrics,
        min_step_w=min_step_w,
    )


@router.get("/current", response_model=LiveNILMCurrentRead)
async def get_live_nilm_current(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=12, le=1000)] = 500,
    min_step_w: Annotated[float, Query(ge=20, le=5000)] = 80.0,
) -> LiveNILMCurrentRead:
    summary = await get_live_nilm_summary(
        home=home,
        session=session,
        device_id=device_id,
        limit=limit,
        min_step_w=min_step_w,
    )
    return summary.current


@router.get("/events", response_model=list[LiveNILMEventRead])
async def get_live_nilm_events(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=12, le=1000)] = 500,
    min_step_w: Annotated[float, Query(ge=20, le=5000)] = 80.0,
) -> list[LiveNILMEventRead]:
    summary = await get_live_nilm_summary(
        home=home,
        session=session,
        device_id=device_id,
        limit=limit,
        min_step_w=min_step_w,
    )
    return summary.events


async def _load_recent_metrics(
    *,
    home_id: uuid.UUID,
    device_id: uuid.UUID | None,
    session: AsyncSession,
    limit: int,
) -> list[EnergyMetric]:
    statement = select(EnergyMetric).where(EnergyMetric.home_id == home_id)
    if device_id is not None:
        statement = statement.where(EnergyMetric.device_id == device_id)
    result = await session.scalars(statement.order_by(EnergyMetric.ts.desc()).limit(limit))
    return list(reversed(list(result)))

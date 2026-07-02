import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.anomaly import (
    Anomaly,
    AnomalySeverity,
    AnomalyStatus,
)
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.anomaly import AnomalyCreate, AnomalyRead, AnomalyUpdate


router = APIRouter(prefix="/homes/{home_id}/anomalies", tags=["anomalies"])


async def get_home_anomaly(
    anomaly_id: uuid.UUID,
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Anomaly:
    anomaly = await session.scalar(
        select(Anomaly).where(
            Anomaly.id == anomaly_id,
            Anomaly.home_id == home.id,
        )
    )
    if anomaly is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anomaly not found",
        )

    return anomaly


async def validate_home_device(
    device_id: uuid.UUID,
    home_id: uuid.UUID,
    session: AsyncSession,
) -> None:
    device = await session.scalar(
        select(Device.id).where(
            Device.id == device_id,
            Device.home_id == home_id,
        )
    )
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )


@router.post("", response_model=AnomalyRead, status_code=status.HTTP_201_CREATED)
async def create_anomaly(
    payload: AnomalyCreate,
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Anomaly:
    if payload.device_id is not None:
        await validate_home_device(payload.device_id, home.id, session)

    anomaly = Anomaly(
        user_id=home.owner_id,
        home_id=home.id,
        device_id=payload.device_id,
        anomaly_type=payload.anomaly_type,
        severity=payload.severity,
        status=payload.status,
        detected_at=payload.detected_at,
        resolved_at=payload.resolved_at,
        title=payload.title,
        description=payload.description,
        score=payload.score,
        metadata_json=payload.metadata_json,
    )
    session.add(anomaly)
    await session.commit()
    await session.refresh(anomaly)

    return anomaly


@router.get("", response_model=list[AnomalyRead])
async def list_anomalies(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    anomaly_status: Annotated[AnomalyStatus | None, Query(alias="status")] = None,
    severity: AnomalySeverity | None = None,
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[Anomaly]:
    statement = select(Anomaly).where(Anomaly.home_id == home.id)
    if anomaly_status is not None:
        statement = statement.where(Anomaly.status == anomaly_status)
    if severity is not None:
        statement = statement.where(Anomaly.severity == severity)
    if device_id is not None:
        statement = statement.where(Anomaly.device_id == device_id)

    result = await session.scalars(
        statement.order_by(Anomaly.detected_at.desc(), Anomaly.created_at.desc()).limit(limit)
    )

    return list(result)


@router.get("/{anomaly_id}", response_model=AnomalyRead)
async def read_anomaly(
    anomaly: Annotated[Anomaly, Depends(get_home_anomaly)],
) -> Anomaly:
    return anomaly


@router.patch("/{anomaly_id}", response_model=AnomalyRead)
async def update_anomaly(
    payload: AnomalyUpdate,
    anomaly: Annotated[Anomaly, Depends(get_home_anomaly)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Anomaly:
    update_data = payload.model_dump(exclude_unset=True)
    if "device_id" in update_data and update_data["device_id"] is not None:
        await validate_home_device(update_data["device_id"], anomaly.home_id, session)

    for field_name, value in update_data.items():
        setattr(anomaly, field_name, value)

    await session.commit()
    await session.refresh(anomaly)

    return anomaly


@router.delete("/{anomaly_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_anomaly(
    anomaly: Annotated[Anomaly, Depends(get_home_anomaly)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    await session.delete(anomaly)
    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

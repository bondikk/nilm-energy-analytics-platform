import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.schemas.device import DeviceCreate, DeviceRead, DeviceUpdate


router = APIRouter(prefix="/homes/{home_id}/devices", tags=["devices"])


async def get_home_device(
    device_id: uuid.UUID,
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Device:
    device = await session.scalar(
        select(Device).where(
            Device.id == device_id,
            Device.home_id == home.id,
        )
    )
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )

    return device


@router.post("", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_device(
    payload: DeviceCreate,
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Device:
    device = Device(
        home_id=home.id,
        external_id=payload.external_id,
        name=payload.name,
        device_type=payload.device_type,
        status=payload.status,
        firmware_version=payload.firmware_version,
        sampling_rate_hz=payload.sampling_rate_hz,
    )
    session.add(device)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device with this external id already exists for this home",
        ) from exc

    await session.refresh(device)

    return device


@router.get("", response_model=list[DeviceRead])
async def list_devices(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[Device]:
    result = await session.scalars(
        select(Device)
        .where(Device.home_id == home.id)
        .order_by(Device.created_at.desc(), Device.name.asc())
    )

    return list(result)


@router.get("/{device_id}", response_model=DeviceRead)
async def read_device(
    device: Annotated[Device, Depends(get_home_device)],
) -> Device:
    return device


@router.patch("/{device_id}", response_model=DeviceRead)
async def update_device(
    payload: DeviceUpdate,
    device: Annotated[Device, Depends(get_home_device)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Device:
    update_data = payload.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(device, field_name, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Device with this external id already exists for this home",
        ) from exc

    await session.refresh(device)

    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device: Annotated[Device, Depends(get_home_device)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    await session.delete(device)
    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

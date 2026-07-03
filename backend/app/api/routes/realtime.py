import uuid
from typing import Annotated

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import AsyncSessionLocal
from app.services.realtime_metrics import RedisMetricEventBus, build_redis_url, metric_event_matches_filter


router = APIRouter(prefix="/homes/{home_id}/metrics", tags=["realtime"])


@router.websocket("/live", name="metrics_live")
async def metrics_live(
    websocket: WebSocket,
    home_id: uuid.UUID,
    token: Annotated[str | None, Query()] = None,
    device_id: uuid.UUID | None = None,
) -> None:
    async with AsyncSessionLocal() as session:
        authorized = await is_authorized_realtime_scope(
            session=session,
            token=token,
            home_id=home_id,
            device_id=device_id,
        )
    if not authorized:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    redis = Redis.from_url(build_redis_url(), decode_responses=False)
    bus = RedisMetricEventBus(redis)

    try:
        async for event in bus.iter_metric_events():
            if metric_event_matches_filter(event, home_id=home_id, device_id=device_id):
                await websocket.send_text(event.model_dump_json())
    except WebSocketDisconnect:
        return
    finally:
        await redis.aclose()


async def is_authorized_realtime_scope(
    session: AsyncSession,
    token: str | None,
    home_id: uuid.UUID,
    device_id: uuid.UUID | None,
) -> bool:
    if token is None:
        return False

    subject = decode_access_token(token)
    if subject is None:
        return False

    try:
        user_id = uuid.UUID(subject)
    except ValueError:
        return False

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        return False

    home_exists = await session.scalar(
        select(Home.id).where(
            Home.id == home_id,
            Home.owner_id == user.id,
        )
    )
    if home_exists is None:
        return False

    if device_id is None:
        return True

    device_exists = await session.scalar(
        select(Device.id).where(
            Device.id == device_id,
            Device.home_id == home_id,
        )
    )
    return device_exists is not None

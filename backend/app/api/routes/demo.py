from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.infrastructure.database.session import get_db_session
from app.schemas.demo import DemoSeedRequest, DemoSeedResponse
from app.services.demo_data import seed_demo_data


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

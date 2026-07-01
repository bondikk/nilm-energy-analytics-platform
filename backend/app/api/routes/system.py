from fastapi import APIRouter

from app.core.config import settings


router = APIRouter(tags=["system"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.project_name,
        "environment": settings.environment,
    }

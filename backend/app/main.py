from fastapi import FastAPI

from app.core.config import settings


app = FastAPI(
    title=settings.project_name,
    version="0.1.0",
    description="Cloud-native NILM and energy analytics platform.",
)


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.project_name,
        "environment": settings.environment,
    }
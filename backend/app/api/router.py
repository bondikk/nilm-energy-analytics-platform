from fastapi import APIRouter

from app.api.routes import auth, devices, energy_metrics, homes, system, users


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(devices.router)
api_router.include_router(energy_metrics.router)
api_router.include_router(homes.router)
api_router.include_router(system.router)
api_router.include_router(users.router)

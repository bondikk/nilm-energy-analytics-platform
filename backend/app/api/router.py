from fastapi import APIRouter

from app.api.routes import auth, homes, system, users


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(homes.router)
api_router.include_router(system.router)
api_router.include_router(users.router)

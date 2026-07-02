import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import get_db_session
from app.schemas.home import HomeCreate, HomeRead, HomeUpdate


router = APIRouter(prefix="/homes", tags=["homes"])


async def get_current_user_home(
    home_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Home:
    home = await session.scalar(
        select(Home).where(
            Home.id == home_id,
            Home.owner_id == current_user.id,
        )
    )
    if home is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Home not found",
        )

    return home


@router.post("", response_model=HomeRead, status_code=status.HTTP_201_CREATED)
async def create_home(
    payload: HomeCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Home:
    home = Home(
        owner_id=current_user.id,
        name=payload.name,
        timezone=payload.timezone,
        location_label=payload.location_label,
    )
    session.add(home)
    await session.commit()
    await session.refresh(home)

    return home


@router.get("", response_model=list[HomeRead])
async def list_homes(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[Home]:
    result = await session.scalars(
        select(Home)
        .where(Home.owner_id == current_user.id)
        .order_by(Home.created_at.desc(), Home.name.asc())
    )

    return list(result)


@router.get("/{home_id}", response_model=HomeRead)
async def read_home(
    home: Annotated[Home, Depends(get_current_user_home)],
) -> Home:
    return home


@router.patch("/{home_id}", response_model=HomeRead)
async def update_home(
    payload: HomeUpdate,
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Home:
    update_data = payload.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(home, field_name, value)

    await session.commit()
    await session.refresh(home)

    return home


@router.delete("/{home_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_home(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    await session.delete(home)
    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

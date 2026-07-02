import pytest
from pydantic import ValidationError

from app.main import app
from app.schemas.auth import UserLogin
from app.schemas.user import UserCreate


def test_auth_and_user_routes_are_registered() -> None:
    assert str(app.url_path_for("register_user")) == "/auth/register"
    assert str(app.url_path_for("login_user")) == "/auth/login"
    assert str(app.url_path_for("read_current_user")) == "/users/me"


def test_user_create_normalizes_email() -> None:
    payload = UserCreate(
        email="  Owner@Example.COM ",
        password="strong-password",
        full_name="Owner",
    )

    assert payload.normalized_email == "owner@example.com"


def test_user_login_rejects_invalid_email() -> None:
    with pytest.raises(ValidationError):
        UserLogin(email="invalid", password="strong-password")

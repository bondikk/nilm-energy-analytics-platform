from app.core.security import create_access_token, decode_access_token, get_password_hash, verify_password


def test_password_hash_round_trip() -> None:
    hashed_password = get_password_hash("correct-password")

    assert hashed_password != "correct-password"
    assert verify_password("correct-password", hashed_password)
    assert not verify_password("wrong-password", hashed_password)


def test_access_token_round_trip() -> None:
    token = create_access_token(subject="user-id")

    assert decode_access_token(token) == "user-id"


def test_invalid_access_token_returns_none() -> None:
    assert decode_access_token("not-a-token") is None

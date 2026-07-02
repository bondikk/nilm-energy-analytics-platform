from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserLogin(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("Invalid email address")
        return normalized

    @property
    def normalized_email(self) -> str:
        return self.email.strip().lower()


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sub: str

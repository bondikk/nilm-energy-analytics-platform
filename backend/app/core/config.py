from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    project_name: str = "VoltPulse Analytics"
    environment: str = "local"

    postgres_db: str = "voltpulse"
    postgres_user: str = "voltpulse"
    postgres_password: SecretStr = SecretStr("voltpulse_dev_password")
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    redis_password: SecretStr = SecretStr("redis_dev_password")
    redis_host: str = "localhost"
    redis_port: int = 6379

    mqtt_username: str = "voltpulse_mqtt"
    mqtt_password: SecretStr = SecretStr("mqtt_dev_password")
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_metrics_topic: str = "voltpulse/+/devices/+/metrics"
    ingestion_auto_create_demo_devices: bool = True
    ingestion_demo_home_name: str = "Demo Apartment"
    ingestion_demo_user_email: str = "demo@voltpulse.local"

    nilm_anomaly_detection_enabled: bool = True
    nilm_anomaly_min_step_w: float = 500.0
    nilm_anomaly_lookback_samples: int = 96
    nilm_anomaly_freshness_seconds: int = 300
    nilm_anomaly_duplicate_window_seconds: int = 600

    ai_analysis_enabled: bool = False
    ai_provider: str = "openai_compatible"
    ai_api_key: SecretStr = SecretStr("")
    ai_model: str = ""
    ai_base_url: str = ""
    ai_request_timeout_seconds: float = 12.0

    jwt_secret_key: SecretStr = SecretStr("change_me_in_production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    db_pool_size: int = 10
    db_max_overflow: int = 20

    frontend_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5175",
    ]

    @property
    def database_url(self) -> str:
        password = quote_plus(self.postgres_password.get_secret_value())
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        password = quote_plus(self.redis_password.get_secret_value())
        return f"redis://:{password}@{self.redis_host}:{self.redis_port}/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

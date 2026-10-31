from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "postgresql+psycopg://sms:sms_dev_password@127.0.0.1:5432/sms_dev"
    test_database_url: str = "postgresql+psycopg://sms:sms_dev_password@127.0.0.1:5432/sms_test"

    jwt_secret: str = "dev-only-change-me-dev-only-change-me"  # noqa: S105 - overridden via .env
    session_ttl_hours: int = 8
    cookie_name: str = "bl_session"
    cookie_secure: bool = False
    # Origins allowed to make state-changing requests (CSRF defence, SameSite=Lax cookie).
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    business_timezone: str = "Asia/Kolkata"
    currency: str = "INR"
    company_name: str = "Brightloop Software"
    quotation_validity_days: int = 30

    @property
    def allowed_origin_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

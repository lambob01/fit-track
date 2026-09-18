from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-me"
    app_username: str = "albert"
    app_password_hash: str = ""
    database_url: str = "sqlite:///./tracker.db"
    cookie_secure: bool = False
    app_env: str = "development"
    session_max_age_s: int = 2_592_000  # 30 days
    import_max_bytes: int = 26_214_400  # 25 MiB


settings = Settings()

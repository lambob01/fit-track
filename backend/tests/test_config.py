from app.config import Settings


def test_settings_defaults(monkeypatch):
    for key in (
        "DATABASE_URL", "SECRET_KEY", "APP_USERNAME", "APP_PASSWORD_HASH",
        "COOKIE_SECURE", "APP_ENV",
    ):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:///./tracker.db"
    assert settings.cookie_secure is False
    assert settings.app_env == "development"
    assert settings.import_max_bytes == 26_214_400


def test_settings_env_overrides(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/x.db")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    settings = Settings(_env_file=None)
    assert settings.database_url == "sqlite:////tmp/x.db"
    assert settings.cookie_secure is True

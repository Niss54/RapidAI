import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_list(value: str) -> list[str]:
    if not value or value.strip() == "*":
        return ["*"]
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_host: str
    app_port: int
    debug: bool
    api_prefix: str
    cors_origins: list[str]
    api_key: str
    max_history: int
    alert_cooldown_seconds: int
    forecast_enabled: bool
    forecast_model_path: Path
    forecast_scaler_path: Path


def load_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "ICU Early Warning Backend"),
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        app_port=int(os.getenv("APP_PORT", "8080")),
        debug=_as_bool(os.getenv("DEBUG"), default=False),
        api_prefix=os.getenv("API_PREFIX", "/api/v1"),
        cors_origins=_as_list(os.getenv("CORS_ORIGINS", "*")),
        api_key=os.getenv("API_KEY", "").strip(),
        max_history=int(os.getenv("MAX_HISTORY", "60")),
        alert_cooldown_seconds=int(os.getenv("ALERT_COOLDOWN_SECONDS", "8")),
        forecast_enabled=_as_bool(os.getenv("FORECAST_ENABLED"), default=True),
        forecast_model_path=PROJECT_ROOT / os.getenv(
            "FORECAST_MODEL_PATH", "src/icu_backend/assets/models/xgb_forecasting.json"
        ),
        forecast_scaler_path=PROJECT_ROOT / os.getenv(
            "FORECAST_SCALER_PATH", "src/icu_backend/assets/scalers/forecast_scaler.pkl"
        ),
    )

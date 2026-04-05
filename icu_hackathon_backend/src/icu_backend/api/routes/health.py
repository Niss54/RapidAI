from flask import Blueprint, current_app, jsonify

from icu_backend.api.deps import get_services

bp = Blueprint("health", __name__)


@bp.get("/health")
def health() -> tuple:
    settings = current_app.config["SETTINGS"]
    services = get_services()
    return (
        jsonify(
            {
                "status": "ok",
                "service": settings.app_name,
                "forecast_enabled": services.forecast_service.enabled,
                "forecast_ready": services.forecast_service.ready,
                "forecast_init_error": services.forecast_service.init_error,
            }
        ),
        200,
    )

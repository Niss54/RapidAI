from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from icu_backend.api import register_blueprints
from icu_backend.config import load_settings
from icu_backend.core import configure_logging
from icu_backend.middleware import enforce_api_key
from icu_backend.services.container import ServiceContainer
from icu_backend.services.forecast_service import ForecastService
from icu_backend.services.identity_resolution_service import IdentityResolutionService
from icu_backend.services.patient_state_service import PatientStateService
from icu_backend.services.risk_engine import RiskEngine
from icu_backend.services.telemetry_decoder_service import TelemetryDecoderService
from icu_backend.services.triage_service import TriageService


def _build_services(settings) -> ServiceContainer:
    return ServiceContainer(
        telemetry_decoder=TelemetryDecoderService(),
        identity_resolver=IdentityResolutionService(),
        patient_state=PatientStateService(
            max_history=settings.max_history,
            alert_cooldown_seconds=settings.alert_cooldown_seconds,
        ),
        risk_engine=RiskEngine(
            max_history=settings.max_history,
            alert_cooldown_seconds=settings.alert_cooldown_seconds,
        ),
        forecast_service=ForecastService(
            enabled=settings.forecast_enabled,
            model_path=settings.forecast_model_path,
            scaler_path=settings.forecast_scaler_path,
        ),
        triage_service=TriageService(),
    )


def create_app() -> Flask:
    settings = load_settings()
    configure_logging(settings.debug)

    app = Flask(__name__)
    CORS(app, resources={r"*": {"origins": settings.cors_origins}})
    app.config["SETTINGS"] = settings
    app.extensions["services"] = _build_services(settings)

    @app.before_request
    def _authenticate() -> None:
        enforce_api_key(request, settings.api_prefix)

    @app.errorhandler(HTTPException)
    def _handle_http_error(error: HTTPException):
        status_code = error.code or 500
        return jsonify({"error": error.description}), status_code

    @app.errorhandler(Exception)
    def _handle_unexpected_error(error: Exception):
        return jsonify({"error": f"Unhandled server error: {str(error)}"}), 500

    register_blueprints(app, settings.api_prefix)
    return app

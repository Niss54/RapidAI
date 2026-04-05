from flask import Flask

from .analysis import bp as analysis_bp
from .forecast import bp as forecast_bp
from .health import bp as health_bp
from .patients import bp as patients_bp
from .telemetry import bp as telemetry_bp


def register_blueprints(app: Flask, api_prefix: str) -> None:
    app.register_blueprint(health_bp)
    app.register_blueprint(telemetry_bp, url_prefix=api_prefix)
    app.register_blueprint(patients_bp, url_prefix=api_prefix)
    app.register_blueprint(forecast_bp, url_prefix=api_prefix)
    app.register_blueprint(analysis_bp, url_prefix=api_prefix)

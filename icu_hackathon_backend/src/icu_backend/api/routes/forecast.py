from flask import Blueprint, jsonify, request

from icu_backend.api.deps import get_services

bp = Blueprint("forecast", __name__)


@bp.post("/forecast/next")
def forecast_next() -> tuple:
    payload = request.get_json(silent=True) or {}
    vitals = payload.get("vitals")
    feature_names = payload.get("feature_names") or []

    if vitals is None:
        return jsonify({"error": "vitals field is required"}), 400

    services = get_services()
    try:
        result = services.forecast_service.forecast_next(vitals, feature_names=feature_names)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503

    return jsonify(result), 200

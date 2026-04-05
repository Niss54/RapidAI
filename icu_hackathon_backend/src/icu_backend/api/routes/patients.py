from flask import Blueprint, jsonify, request

from icu_backend.api.deps import get_services

bp = Blueprint("patients", __name__)


@bp.get("/patients")
def list_patients() -> tuple:
    services = get_services()
    return jsonify({"patients": services.patient_state.list_patients()}), 200


@bp.get("/patients/<patient_id>")
def patient_state(patient_id: str) -> tuple:
    services = get_services()
    state = services.patient_state.get_patient(patient_id)
    if not state:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify(state), 200


@bp.get("/alerts")
def recent_alerts() -> tuple:
    services = get_services()
    patient_id = request.args.get("patient_id")
    try:
        limit = int(request.args.get("limit", 30))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    alerts = services.patient_state.recent_alerts(limit=limit, patient_id=patient_id)
    return jsonify({"alerts": alerts, "count": len(alerts)}), 200

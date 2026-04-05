from flask import Blueprint, jsonify, request

from icu_backend.api.deps import get_services

bp = Blueprint("analysis", __name__)


@bp.post("/analysis/triage")
def triage() -> tuple:
    payload = request.get_json(silent=True) or {}
    patient_id = payload.get("patient_id")
    vitals = payload.get("vitals")

    services = get_services()

    if vitals is None and patient_id:
        patient = services.patient_state.get_patient(str(patient_id))
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        vitals = patient.get("latest_vitals", {})

    if not isinstance(vitals, dict):
        return jsonify({"error": "vitals must be provided as an object"}), 400

    result = services.triage_service.analyze(vitals)
    if patient_id is not None:
        result["patient_id"] = str(patient_id)

    return jsonify(result), 200

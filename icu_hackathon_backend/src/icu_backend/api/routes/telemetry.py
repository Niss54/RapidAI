from flask import Blueprint, jsonify, request

from icu_backend.api.deps import get_services

bp = Blueprint("telemetry", __name__)


@bp.post("/telemetry/ingest")
def ingest_telemetry() -> tuple:
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "JSON body must be an object"}), 400

    services = get_services()
    patient_id, conflicts = services.identity_resolver.resolve(payload)
    observations, decode_warnings = services.telemetry_decoder.decode(payload)

    if not observations:
        return (
            jsonify(
                {
                    "patient_id": patient_id,
                    "observations_ingested": 0,
                    "warnings": decode_warnings,
                    "conflicts": conflicts,
                    "message": "No observations processed",
                }
            ),
            202,
        )

    normalized, alerts, risk_score, risk_level = services.risk_engine.evaluate(patient_id, observations)
    source = str(payload.get("source") or payload.get("monitor_id") or payload.get("bed_id") or "unknown")
    state = services.patient_state.update(
        patient_id=patient_id,
        observations=normalized,
        alerts=alerts,
        risk_score=risk_score,
        risk_level=risk_level,
        conflicts=conflicts,
        source=source,
    )

    return (
        jsonify(
            {
                "patient_id": patient_id,
                "observations_ingested": len(normalized),
                "alerts_generated": len(alerts),
                "risk_score": risk_score,
                "risk_level": risk_level,
                "warnings": decode_warnings,
                "conflicts": conflicts,
                "latest_vitals": state["latest_vitals"],
            }
        ),
        200,
    )

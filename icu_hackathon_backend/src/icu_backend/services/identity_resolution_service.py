import hashlib
import threading
from typing import Any


class IdentityResolutionService:
    """Resolves patient identity conflicts from monitor/source metadata."""

    def __init__(self):
        self._bindings: dict[str, str] = {}
        self._lock = threading.RLock()

    def resolve(self, payload: dict[str, Any]) -> tuple[str, list[str]]:
        notes: list[str] = []

        direct_id = payload.get("patient_id")
        candidates = [str(c) for c in payload.get("patient_candidates", []) if c is not None]
        monitor_key = self._monitor_key(payload)

        with self._lock:
            if direct_id is not None:
                patient_id = str(direct_id)
                self._bind(monitor_key, patient_id)
                return patient_id, notes

            bound_patient = self._bindings.get(monitor_key)
            if bound_patient:
                if candidates and bound_patient not in candidates:
                    notes.append(
                        "Identity conflict resolved using existing monitor binding "
                        f"({monitor_key} -> {bound_patient})"
                    )
                return bound_patient, notes

            if candidates:
                patient_id = candidates[0]
                self._bind(monitor_key, patient_id)
                if len(candidates) > 1:
                    notes.append(
                        "Multiple patient candidates supplied; selected first candidate "
                        f"{patient_id}"
                    )
                return patient_id, notes

            fallback = f"{monitor_key}|{payload.get('bed_id', '')}|{payload.get('source', '')}"
            digest = hashlib.sha1(fallback.encode("utf-8")).hexdigest()[:10]
            patient_id = f"anon_{digest}"
            self._bind(monitor_key, patient_id)
            notes.append("No explicit patient identity found; generated deterministic anonymous ID")
            return patient_id, notes

    def _bind(self, monitor_key: str, patient_id: str) -> None:
        if monitor_key:
            self._bindings[monitor_key] = patient_id

    @staticmethod
    def _monitor_key(payload: dict[str, Any]) -> str:
        return str(
            payload.get("monitor_id")
            or payload.get("source")
            or payload.get("bed_id")
            or "unknown_monitor"
        )

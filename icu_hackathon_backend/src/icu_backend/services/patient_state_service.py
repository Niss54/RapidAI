import threading
import time
from collections import defaultdict, deque
from typing import Any


class PatientStateService:
    def __init__(self, max_history: int):
        self.max_history = max_history
        self._patients: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()

    def update(
        self,
        patient_id: str,
        observations: list[dict[str, Any]],
        alerts: list[dict[str, Any]],
        risk_score: int,
        risk_level: str,
        conflicts: list[str],
        source: str,
    ) -> dict[str, Any]:
        with self._lock:
            state = self._patients.setdefault(patient_id, self._empty_state(patient_id))

            for obs in observations:
                signal = obs["signal"]
                value = float(obs["value"])
                ts = float(obs["timestamp"])
                state["latest_vitals"][signal] = value
                state["signal_history"][signal].append({"value": value, "timestamp": ts})

            for alert in alerts:
                state["alerts"].append(alert)

            for note in conflicts:
                state["conflicts"].append({"timestamp": time.time(), "note": note})

            state["risk_score"] = risk_score
            state["risk_level"] = risk_level
            state["last_source"] = source
            state["updated_at"] = time.time()

            return self._serialize_patient(state)

    def list_patients(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = []
            for patient_id, state in self._patients.items():
                rows.append(
                    {
                        "patient_id": patient_id,
                        "risk_score": state["risk_score"],
                        "risk_level": state["risk_level"],
                        "last_source": state["last_source"],
                        "updated_at": state["updated_at"],
                        "latest_vitals": dict(state["latest_vitals"]),
                    }
                )
            rows.sort(key=lambda row: row.get("updated_at") or 0, reverse=True)
            return rows

    def get_patient(self, patient_id: str) -> dict[str, Any] | None:
        with self._lock:
            state = self._patients.get(patient_id)
            if not state:
                return None
            return self._serialize_patient(state)

    def recent_alerts(self, limit: int = 30, patient_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if patient_id:
                state = self._patients.get(patient_id)
                if not state:
                    return []
                return list(state["alerts"])[-limit:]

            all_alerts: list[dict[str, Any]] = []
            for state in self._patients.values():
                all_alerts.extend(state["alerts"])

            all_alerts.sort(key=lambda row: row.get("timestamp", 0), reverse=True)
            return all_alerts[:limit]

    def _empty_state(self, patient_id: str) -> dict[str, Any]:
        return {
            "patient_id": patient_id,
            "latest_vitals": {},
            "signal_history": defaultdict(lambda: deque(maxlen=self.max_history)),
            "alerts": deque(maxlen=200),
            "conflicts": deque(maxlen=30),
            "risk_score": 0,
            "risk_level": "low",
            "last_source": "",
            "updated_at": None,
        }

    @staticmethod
    def _serialize_patient(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "patient_id": state["patient_id"],
            "latest_vitals": dict(state["latest_vitals"]),
            "signal_history": {
                signal: list(entries) for signal, entries in state["signal_history"].items()
            },
            "alerts": list(state["alerts"]),
            "conflicts": list(state["conflicts"]),
            "risk_score": state["risk_score"],
            "risk_level": state["risk_level"],
            "last_source": state["last_source"],
            "updated_at": state["updated_at"],
        }

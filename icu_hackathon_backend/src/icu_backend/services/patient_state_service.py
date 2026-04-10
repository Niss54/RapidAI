import math
import threading
import time
from collections import defaultdict, deque
from typing import Any


class PatientStateService:
    def __init__(self, max_history: int, alert_cooldown_seconds: int = 0):
        self.max_history = max_history
        self.alert_cooldown_seconds = max(0, int(alert_cooldown_seconds))
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
        monitor_id: str | None = None,
        resolution_strategy: str | None = None,
        resolution_timestamp: float | None = None,
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
            state["monitor_id"] = str(monitor_id or state.get("monitor_id") or source or "unknown_monitor")
            if resolution_strategy:
                state["resolution_strategy"] = str(resolution_strategy)
            if resolution_timestamp is not None:
                try:
                    state["resolution_timestamp"] = float(resolution_timestamp)
                except (TypeError, ValueError):
                    state["resolution_timestamp"] = state.get("resolution_timestamp")

            return self._serialize_patient(state)

    def list_patients(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = []
            for patient_id, state in self._patients.items():
                rows.append(
                    {
                        "patient_id": patient_id,
                        "monitor_id": state["monitor_id"],
                        "resolution_strategy": state["resolution_strategy"],
                        "timestamp": state["resolution_timestamp"]
                        if state.get("resolution_timestamp") is not None
                        else state["updated_at"],
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
            now = time.time()

            if patient_id:
                state = self._patients.get(patient_id)
                if not state:
                    return []

                alerts = list(state["alerts"])[-limit:]
                return [self._with_cooldown_status(alert, now) for alert in alerts]

            all_alerts: list[dict[str, Any]] = []
            for state in self._patients.values():
                all_alerts.extend(state["alerts"])

            all_alerts.sort(key=lambda row: row.get("timestamp", 0), reverse=True)
            return [self._with_cooldown_status(alert, now) for alert in all_alerts[:limit]]

    def _with_cooldown_status(self, alert: dict[str, Any], now: float) -> dict[str, Any]:
        row = dict(alert)
        timestamp_raw = row.get("timestamp")

        try:
            timestamp = float(timestamp_raw)
        except (TypeError, ValueError):
            timestamp = 0.0

        elapsed_seconds = max(0.0, now - timestamp)
        remaining_seconds = max(
            0,
            int(math.ceil(self.alert_cooldown_seconds - elapsed_seconds)),
        )

        row["duplicate_suppressed"] = remaining_seconds > 0
        row["cooldown_remaining_seconds"] = remaining_seconds
        return row

    def _empty_state(self, patient_id: str) -> dict[str, Any]:
        return {
            "patient_id": patient_id,
            "latest_vitals": {},
            "signal_history": defaultdict(lambda: deque(maxlen=self.max_history)),
            "alerts": deque(maxlen=200),
            "conflicts": deque(maxlen=30),
            "monitor_id": "unknown_monitor",
            "resolution_strategy": "unknown",
            "resolution_timestamp": None,
            "risk_score": 0,
            "risk_level": "low",
            "last_source": "",
            "updated_at": None,
        }

    @staticmethod
    def _serialize_patient(state: dict[str, Any]) -> dict[str, Any]:
        return {
            "patient_id": state["patient_id"],
            "monitor_id": state.get("monitor_id"),
            "resolution_strategy": state.get("resolution_strategy"),
            "timestamp": state.get("resolution_timestamp")
            if state.get("resolution_timestamp") is not None
            else state.get("updated_at"),
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

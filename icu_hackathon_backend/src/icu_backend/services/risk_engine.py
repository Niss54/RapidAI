import math
import statistics
import threading
import time
from collections import defaultdict, deque
from typing import Any


class RiskEngine:
    """Rule-based anomaly and early warning engine adapted from ICU actor logic."""

    SIGNAL_ALIASES = {
        "SOLAR8000/HR": "HR",
        "CARDIOQ/HR": "HR",
        "SOLAR8000/PLETH_HR": "HR",
        "HR": "HR",
        "SOLAR8000/PLETH_SPO2": "SpO2",
        "SPO2": "SpO2",
        "ART_MBP": "MAP",
        "SOLAR8000/ART_MBP": "MAP",
        "EV1000/ART_MBP": "MAP",
        "MAP": "MAP",
        "SOLAR8000/RR": "RR",
        "SOLAR8000/RR_CO2": "RR",
        "PRIMUS/RR_CO2": "RR",
        "SOLAR8000/VENT_RR": "RR",
        "RESP": "RR",
        "RR": "RR",
        "SOLAR8000/BT": "TEMP",
        "BT": "TEMP",
        "TEMP": "TEMP",
        "SOLAR8000/ART_SBP": "SBP",
        "ART_SBP": "SBP",
        "SBP": "SBP",
        "SOLAR8000/ART_DBP": "DBP",
        "ART_DBP": "DBP",
        "DBP": "DBP",
    }

    THRESHOLDS = {
        "HR": {
            "low_mild": 60,
            "high_mild": 100,
            "low_crit": 40,
            "high_crit": 140,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (30, 200),
        },
        "SpO2": {
            "low_mild": 90,
            "high_mild": None,
            "low_crit": 85,
            "high_crit": None,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (70, 100),
        },
        "MAP": {
            "low_mild": 65,
            "high_mild": 105,
            "low_crit": 55,
            "high_crit": 120,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (50, 140),
        },
        "RR": {
            "low_mild": 10,
            "high_mild": 24,
            "low_crit": 8,
            "high_crit": 30,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (5, 40),
        },
        "TEMP": {
            "low_mild": 36.0,
            "high_mild": 38.0,
            "low_crit": 35.0,
            "high_crit": 39.0,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (34.0, 40.0),
        },
        "SBP": {
            "low_mild": 90,
            "high_mild": 140,
            "low_crit": 70,
            "high_crit": 160,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (50, 200),
        },
        "DBP": {
            "low_mild": 60,
            "high_mild": 90,
            "low_crit": 40,
            "high_crit": 100,
            "z_mild": 2.0,
            "z_crit": 3.0,
            "clip": (30, 120),
        },
    }

    def __init__(self, max_history: int, alert_cooldown_seconds: int):
        self.max_history = max_history
        self.alert_cooldown_seconds = alert_cooldown_seconds
        self._history: dict[str, dict[str, deque[float]]] = defaultdict(
            lambda: defaultdict(lambda: deque(maxlen=self.max_history))
        )
        self._last_alert: dict[str, float] = {}
        self._recent_alerts: dict[str, deque[dict[str, Any]]] = defaultdict(lambda: deque(maxlen=200))
        self._lock = threading.RLock()

    def evaluate(
        self, patient_id: str, observations: list[dict[str, Any]]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, str]:
        normalized_observations: list[dict[str, Any]] = []
        alerts: list[dict[str, Any]] = []

        with self._lock:
            for observation in observations:
                normalized = self._normalize_observation(observation)
                if normalized is None:
                    continue
                normalized_observations.append(normalized)

                signal = normalized["signal"]
                value = normalized["value"]
                ts = normalized["timestamp"]
                thresholds = self.THRESHOLDS.get(signal)
                if not thresholds:
                    continue

                clip_min, clip_max = thresholds["clip"]
                if value < clip_min or value > clip_max:
                    alert = self._build_alert(
                        patient_id,
                        signal,
                        value,
                        ts,
                        severity="high",
                        reason="sensor_outlier",
                    )
                    self._append_alert_if_allowed(alerts, alert)
                    continue

                history = self._history[patient_id][signal]
                history.append(value)

                self._range_alerts(patient_id, signal, value, ts, thresholds, alerts)
                self._zscore_alerts(patient_id, signal, value, ts, history, thresholds, alerts)
                self._flatline_alert(patient_id, signal, value, ts, history, alerts)

            now = time.time()
            self._recent_alerts[patient_id].extend(alerts)
            self._prune_recent_alerts(patient_id, now)
            risk_score, risk_level = self._compute_risk(patient_id)

        return normalized_observations, alerts, risk_score, risk_level

    def _normalize_observation(self, observation: dict[str, Any]) -> dict[str, Any] | None:
        source_signal = str(observation.get("signal", "")).strip()
        signal = self.SIGNAL_ALIASES.get(source_signal.upper(), source_signal)
        if signal not in self.THRESHOLDS:
            return None

        try:
            raw_value = observation.get("value")
            if raw_value is None:
                return None
            value = float(raw_value)
            timestamp = float(observation.get("timestamp", time.time()))
        except (TypeError, ValueError):
            return None

        if not math.isfinite(value):
            return None

        return {
            "signal": signal,
            "source_signal": observation.get("source_signal", source_signal),
            "value": value,
            "timestamp": timestamp,
        }

    def _range_alerts(
        self,
        patient_id: str,
        signal: str,
        value: float,
        timestamp: float,
        thresholds: dict[str, Any],
        out: list[dict[str, Any]],
    ) -> None:
        low_crit = thresholds["low_crit"]
        high_crit = thresholds["high_crit"]
        low_mild = thresholds["low_mild"]
        high_mild = thresholds["high_mild"]

        if (low_crit is not None and value < low_crit) or (
            high_crit is not None and value > high_crit
        ):
            alert = self._build_alert(
                patient_id,
                signal,
                value,
                timestamp,
                severity="urgent",
                reason="critical_range_violation",
            )
            self._append_alert_if_allowed(out, alert)
            return

        if (low_mild is not None and value < low_mild) or (
            high_mild is not None and value > high_mild
        ):
            alert = self._build_alert(
                patient_id,
                signal,
                value,
                timestamp,
                severity="high",
                reason="mild_range_violation",
            )
            self._append_alert_if_allowed(out, alert)

    def _zscore_alerts(
        self,
        patient_id: str,
        signal: str,
        value: float,
        timestamp: float,
        history: deque[float],
        thresholds: dict[str, Any],
        out: list[dict[str, Any]],
    ) -> None:
        if len(history) < 5:
            return

        std = statistics.pstdev(history)
        if std == 0:
            return
        mean = statistics.fmean(history)
        z_value = abs((value - mean) / std)

        if thresholds["z_crit"] is not None and z_value > thresholds["z_crit"]:
            alert = self._build_alert(
                patient_id,
                signal,
                value,
                timestamp,
                severity="urgent",
                reason=f"z_score_critical:{z_value:.2f}",
            )
            self._append_alert_if_allowed(out, alert)
            return

        if thresholds["z_mild"] is not None and z_value > thresholds["z_mild"]:
            alert = self._build_alert(
                patient_id,
                signal,
                value,
                timestamp,
                severity="moderate",
                reason=f"z_score_mild:{z_value:.2f}",
            )
            self._append_alert_if_allowed(out, alert)

    def _flatline_alert(
        self,
        patient_id: str,
        signal: str,
        value: float,
        timestamp: float,
        history: deque[float],
        out: list[dict[str, Any]],
    ) -> None:
        if len(history) < 10:
            return
        last_ten = list(history)[-10:]
        if max(last_ten) - min(last_ten) <= 1e-6:
            alert = self._build_alert(
                patient_id,
                signal,
                value,
                timestamp,
                severity="urgent",
                reason="flatline_detected",
            )
            self._append_alert_if_allowed(out, alert)

    def _append_alert_if_allowed(self, out: list[dict[str, Any]], alert: dict[str, Any]) -> None:
        signature = f"{alert['patient_id']}|{alert['signal']}|{alert['reason']}"
        now = alert["timestamp"]
        last = self._last_alert.get(signature)
        if last is not None and now - last < self.alert_cooldown_seconds:
            return
        self._last_alert[signature] = now
        out.append(alert)

    @staticmethod
    def _build_alert(
        patient_id: str,
        signal: str,
        value: float,
        timestamp: float,
        severity: str,
        reason: str,
    ) -> dict[str, Any]:
        return {
            "patient_id": patient_id,
            "signal": signal,
            "value": value,
            "timestamp": timestamp,
            "severity": severity,
            "reason": reason,
        }

    def _prune_recent_alerts(self, patient_id: str, now: float) -> None:
        window_seconds = 300
        recent = self._recent_alerts[patient_id]
        while recent and now - recent[0]["timestamp"] > window_seconds:
            recent.popleft()

    def _compute_risk(self, patient_id: str) -> tuple[int, str]:
        weights = {"urgent": 40, "high": 22, "moderate": 12, "low": 4}
        total = 0
        for alert in self._recent_alerts[patient_id]:
            total += weights.get(alert["severity"], 4)

        score = min(100, total)
        if score >= 75:
            level = "critical"
        elif score >= 45:
            level = "high"
        elif score >= 20:
            level = "moderate"
        else:
            level = "low"
        return score, level

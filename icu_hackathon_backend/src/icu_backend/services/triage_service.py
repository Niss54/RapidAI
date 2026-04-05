from typing import Any


class TriageService:
    """Rule-based triage enhancement inspired by llm_tools clinical metrics."""

    def analyze(self, vitals: dict[str, Any]) -> dict[str, Any]:
        hr = self._pick(vitals, ["HR"])
        sbp = self._pick(vitals, ["SBP", "ART_SBP"])
        dbp = self._pick(vitals, ["DBP", "ART_DBP"])
        temp = self._pick(vitals, ["TEMP", "BT"])
        rr = self._pick(vitals, ["RR", "RESP"])

        results: dict[str, Any] = {
            "shock_index": self._shock_index(hr, sbp),
            "map": self._map_value(sbp, dbp),
            "sepsis_warning": self._sepsis_warning(hr, temp),
            "cushings_warning": self._cushings_warning(hr, sbp, rr),
        }

        severity_rank = {"negligible": 0, "moderate": 1, "high": 2, "urgent": 3}
        overall = "negligible"
        for item in results.values():
            severity = item.get("severity", "negligible")
            if severity_rank[severity] > severity_rank[overall]:
                overall = severity

        return {
            "overall_severity": overall,
            "insights": results,
        }

    @staticmethod
    def _pick(vitals: dict[str, Any], keys: list[str]) -> float | None:
        for key in keys:
            if key in vitals:
                try:
                    return float(vitals[key])
                except (TypeError, ValueError):
                    return None
        return None

    @staticmethod
    def _shock_index(hr: float | None, sbp: float | None) -> dict[str, Any]:
        if hr is None or sbp in (None, 0):
            return {"available": False, "severity": "negligible"}

        value = hr / sbp
        if value > 0.9:
            severity = "urgent"
            assessment = "Critical"
        elif value > 0.7:
            severity = "high"
            assessment = "Abnormal"
        else:
            severity = "negligible"
            assessment = "Normal"

        return {
            "available": True,
            "value": round(value, 2),
            "assessment": assessment,
            "severity": severity,
        }

    @staticmethod
    def _map_value(sbp: float | None, dbp: float | None) -> dict[str, Any]:
        if sbp is None or dbp is None:
            return {"available": False, "severity": "negligible"}

        value = (sbp + 2 * dbp) / 3
        if value < 65:
            severity = "high"
            assessment = "Low Perfusion Warning"
        else:
            severity = "negligible"
            assessment = "Normal"

        return {
            "available": True,
            "value": round(value, 1),
            "assessment": assessment,
            "severity": severity,
        }

    @staticmethod
    def _sepsis_warning(hr: float | None, temp: float | None) -> dict[str, Any]:
        if hr is None or temp is None:
            return {"available": False, "severity": "negligible"}

        if temp > 38.5 and hr > 120:
            return {
                "available": True,
                "assessment": "Sepsis early warning criteria met",
                "severity": "urgent",
            }

        return {
            "available": True,
            "assessment": "No sepsis warning criteria met",
            "severity": "negligible",
        }

    @staticmethod
    def _cushings_warning(hr: float | None, sbp: float | None, rr: float | None) -> dict[str, Any]:
        if hr is None or sbp is None:
            return {"available": False, "severity": "negligible"}

        irregular_resp = rr is not None and (rr < 8 or rr > 28)
        if sbp > 180 and hr < 60 and irregular_resp:
            return {
                "available": True,
                "assessment": "Potential Cushing's triad pattern",
                "severity": "urgent",
            }

        return {
            "available": True,
            "assessment": "No Cushing's triad pattern detected",
            "severity": "negligible",
        }

from typing import Any


class TriageService:
    """Rule-based triage enhancement inspired by llm_tools clinical metrics."""

    PRIORITY_BY_SEVERITY = {
        "urgent": "P1 - Immediate",
        "high": "P2 - Rapid Evaluation",
        "moderate": "P3 - Closely Monitor",
        "negligible": "P4 - Routine Monitoring",
    }

    ESCALATION_BY_SEVERITY = {
        "urgent": "Activate critical response immediately and prepare high-acuity intervention.",
        "high": "Notify ICU physician now and reassess full vitals panel within 5 minutes.",
        "moderate": "Inform duty nurse and repeat vitals in 15 minutes.",
        "negligible": "Continue routine monitoring and document current status.",
    }

    INSIGHT_LABELS = {
        "shock_index": "Shock Index",
        "map": "MAP",
        "sepsis_warning": "Sepsis Warning",
        "cushings_warning": "Cushing Pattern",
    }

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

        triage_priority = self.PRIORITY_BY_SEVERITY.get(overall, self.PRIORITY_BY_SEVERITY["negligible"])
        recommended_escalation = self.ESCALATION_BY_SEVERITY.get(
            overall,
            self.ESCALATION_BY_SEVERITY["negligible"],
        )

        risk_explanation_summary = self._risk_explanation_summary(results, overall)

        return {
            "overall_severity": overall,
            "insights": results,
            "triage_priority": triage_priority,
            "recommended_escalation": recommended_escalation,
            "risk_explanation_summary": risk_explanation_summary,
        }

    def _risk_explanation_summary(self, insights: dict[str, dict[str, Any]], overall: str) -> str:
        elevated_signals: list[str] = []

        for key, insight in insights.items():
            if not isinstance(insight, dict):
                continue

            if not insight.get("available", False):
                continue

            severity = str(insight.get("severity", "negligible"))
            if severity not in {"moderate", "high", "urgent"}:
                continue

            assessment = str(insight.get("assessment", "")).strip()
            if not assessment:
                continue

            label = self.INSIGHT_LABELS.get(key, key.replace("_", " ").title())
            elevated_signals.append(f"{label}: {assessment}")

        if elevated_signals:
            return "; ".join(elevated_signals[:3])

        if overall == "negligible":
            return "No high-risk triage criteria met from available vitals."

        return "Risk indicators are partially available; collect missing vitals and reassess."

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

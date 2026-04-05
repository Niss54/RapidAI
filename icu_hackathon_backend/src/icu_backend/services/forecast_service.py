import pickle
from pathlib import Path
from typing import Any

import numpy as np


class ForecastService:
    """Optional XGBoost forecasting service migrated from vitalrpm API."""

    def __init__(self, enabled: bool, model_path: Path, scaler_path: Path):
        self.enabled = enabled
        self.model_path = model_path
        self.scaler_path = scaler_path

        self._ready = False
        self._model = None
        self._scaler = None
        self._xgb = None
        self._init_error = ""

        if self.enabled:
            self._initialize()

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def init_error(self) -> str:
        return self._init_error

    def _initialize(self) -> None:
        try:
            import xgboost as xgb

            with self.scaler_path.open("rb") as file_handle:
                self._scaler = pickle.load(file_handle)

            model = xgb.Booster()
            model.load_model(str(self.model_path))
            self._model = model
            self._xgb = xgb
            self._ready = True
        except Exception as exc:
            self._ready = False
            self._init_error = str(exc)

    def forecast_next(
        self, vitals: list[list[float]] | list[float], feature_names: list[str] | None = None
    ) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("Forecast service is disabled")
        if not self._ready:
            raise RuntimeError(f"Forecast service not ready: {self._init_error}")
        if self._model is None or self._scaler is None or self._xgb is None:
            raise RuntimeError("Forecast service was enabled but did not initialize correctly")

        array_data = np.asarray(vitals, dtype=float)
        if array_data.ndim == 1:
            array_data = array_data.reshape(1, -1)

        expected = getattr(self._scaler, "n_features_in_", array_data.shape[1])
        if array_data.shape[1] != expected:
            raise ValueError(
                f"Expected {expected} features per row, received {array_data.shape[1]}"
            )

        normalized = self._scaler.transform(array_data)
        matrix = self._xgb.DMatrix(normalized)
        forecast = self._model.predict(matrix)
        restored = self._scaler.inverse_transform(forecast)
        next_values = np.squeeze(restored[-1]).tolist()

        if not isinstance(next_values, list):
            next_values = [float(next_values)]

        status = self._status_from_values(next_values, feature_names or [])
        return {
            "forecasted_vitals": [round(float(v), 2) for v in next_values],
            "status": status,
        }

    def _status_from_values(self, values: list[float], feature_names: list[str]) -> str:
        if not feature_names:
            return "status_warning" if max(values) > 150 or min(values) < 35 else "status_normal"

        upper = {name.upper(): values[idx] for idx, name in enumerate(feature_names) if idx < len(values)}
        hr = upper.get("HR")
        spo2 = upper.get("SPO2")
        sbp = upper.get("SBP")
        temp = upper.get("TEMP")

        if (hr is not None and (hr < 40 or hr > 140)) or (
            spo2 is not None and spo2 < 85
        ) or (sbp is not None and sbp < 70) or (temp is not None and temp > 39):
            return "status_critical"

        if (hr is not None and (hr < 55 or hr > 120)) or (
            spo2 is not None and spo2 < 90
        ) or (sbp is not None and sbp < 90) or (temp is not None and temp > 38):
            return "status_high"

        return "status_normal"

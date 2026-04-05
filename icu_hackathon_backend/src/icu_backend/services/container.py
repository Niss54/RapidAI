from dataclasses import dataclass

from .forecast_service import ForecastService
from .identity_resolution_service import IdentityResolutionService
from .patient_state_service import PatientStateService
from .risk_engine import RiskEngine
from .telemetry_decoder_service import TelemetryDecoderService
from .triage_service import TriageService


@dataclass
class ServiceContainer:
    telemetry_decoder: TelemetryDecoderService
    identity_resolver: IdentityResolutionService
    patient_state: PatientStateService
    risk_engine: RiskEngine
    forecast_service: ForecastService
    triage_service: TriageService

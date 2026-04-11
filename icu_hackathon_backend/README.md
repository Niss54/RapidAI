# Rapid AI – Real-Time ICU Telemetry Intelligence Platform

**Predictive voice-enabled ICU monitoring system built by Syntrix**

**Team:** Syntrix | Nissh

## SECTION 1 — Executive Summary

Rapid AI is a real-time ICU intelligence platform that ingests telemetry, decodes raw hex streams, resolves patient identity collisions, computes risk severity, predicts near-future deterioration, escalates critical alerts, and serves clinical context through dashboard plus voice interaction.

Implemented in this repository:

1. Real-time telemetry ingestion via `POST /telemetry/update` (Express) and `POST /api/v1/telemetry/ingest` (Flask analytics).
2. Hex decoding with physiologic ID mapping and payload normalization.
3. Identity resolution with deterministic fallback IDs for collision safety.
4. Risk scoring engine with weighted signal contributions and severity bands.
5. Forecast prediction with XGBoost-backed service and deterministic fallback.
6. Alert escalation pipeline with dashboard, voice broadcast, and optional WhatsApp channel.
7. Timeline intelligence persisted in Supabase (`telemetry_events`, `alert_events`, `voice_interactions`).
8. Voice assistant workflows (STT, intent, summary reply, TTS, LiveKit broadcast).
9. API platform access with API key generation, validation, quotas, and expiration checks.
10. HL7 TCP and serial bridge ingestion adapters.

The system is designed to detect deterioration before emergencies by combining current vitals, trend-sensitive risk logic, and near-term forecasting with escalation-ready outputs.

## SECTION 2 — Clinical Problem Statement

Rapid AI addresses ICU gaps that are directly reflected in the codebase implementation:

1. Fragmented telemetry formats: handled by structured JSON, hex payload decode, HL7 ORU^R01 adapter, and serial line adapter.
2. Monitor identity conflicts: handled by monitor binding and collision-safe identity fallback logic.
3. Alert fatigue: handled by alert cooldown and suppression metadata.
4. Late escalation workflows: handled by automatic critical escalation and optional remote WhatsApp forwarding.
5. Lack of predictive analytics: handled by 5-minute forecasting endpoint and projection timelines.
6. Language barriers: handled by multilingual voice interaction pipeline.
7. Absence of remote escalation channels: handled by optional WhatsApp integration layer.

## SECTION 3 — System Pipeline Overview

```text
Telemetry Input
-> Hex Decoder
-> Identity Resolver
-> Risk Engine
-> Forecast Engine
-> Alert Engine
-> Timeline Engine
-> Voice Assistant
-> Dashboard
-> API Platform
-> WhatsApp Escalation
```

## SECTION 4 — Key Features (Auto-detected from repository)

1. Hex telemetry decoding panel: implemented (`HexDecoderPanel`) with analytics ingest call.
2. Identity mapping inspector: implemented (`IdentityCollisionPanel`) using analytics patient mapping data.
3. Real-time risk scoring engine: implemented in Node risk engine for live telemetry.
4. Forecast prediction widget: implemented (`ForecastWidget`) with `/api/v1/forecast/next` integration.
5. Alert timeline stream: implemented (`AlertsTimelinePanel`, `AlertsStreamWidget`, `AlertFeedPanel`).
6. Historical telemetry visualization: implemented (`TelemetryTimelineChart`, `StabilityTimeline`).
7. ICU distribution summary panel: implemented (`ICUSummaryPanel`).
8. Voice interaction logs viewer: implemented (`VoiceLogsPanel`).
9. LiveKit broadcast status indicator: implemented (`LiveKitStatusIndicator`, `VoiceServiceStatusPanel`).
10. WhatsApp escalation integration: implemented in escalation dispatcher + WhatsApp service.
11. API key developer access system: implemented (`/api-key/my-key`, `/api-key/regenerate`, dashboard API access page).
12. HL7 ingestion adapter: implemented (`hl7IngestionService`, ORU^R01 parser).
13. Serial telemetry bridge: implemented (`serialBridge`) with reconnect logic.
14. Simulator engine: implemented backend simulator endpoints and Python telemetry simulator tool.
15. Forecast readiness monitor: implemented through `/health` forecast status + dashboard readiness indicators.
16. Patient drilldown page: implemented (`/patients/[id]`) with triage, timeline, alerts, forecast, and voice logs.
17. Triage insights engine: implemented (`/api/v1/analysis/triage` + patient drilldown rendering).
18. Integration status dashboard: implemented (`IntegrationStatusPanel` + `/integration/*` routes).

## SECTION 5 — Architecture Overview

Rapid AI is implemented as a layered healthcare AI stack:

1. Frontend dashboard (Next.js): operator UI for monitoring, timelines, triage insights, voice controls, and API docs.
2. Telemetry backend (Express): ingestion, risk scoring, escalation dispatch, timeline/summary APIs, integration status.
3. Forecast analytics service (Flask): telemetry ingest, patient/alerts API, triage analysis, XGBoost forecast endpoint.
4. Voice processing layer (Sarvam + Groq): STT, intent classification, contextual response generation, TTS synthesis.
5. Realtime broadcast layer (LiveKit): token issuance and room data broadcast for voice/alert messaging.
6. Persistence layer (Supabase): patient state, telemetry events, alerts, voice logs, API keys, usage logs.
7. Integration adapters (HL7 + Serial): live monitor transport adapters forwarding normalized telemetry.
8. External escalation channel (WhatsApp): optional critical alert forwarding via Cloud API.

## SECTION 6 — Real ICU Integration Compatibility

Current repository support:

1. HL7 telemetry ingestion: implemented via TCP listener with ORU^R01 parsing and ACK handling.
2. Serial monitor bridge ingestion: implemented with serial parser, reconnect logic, and telemetry forwarding.
3. Vendor middleware compatibility: supported through normalized ingestion payload contract (`patientId`, vitals, monitor/source metadata) and adapters.
4. FHIR synchronization readiness: not yet implemented as a native connector in this codebase; data model and API layer are structured for future FHIR mapping.
5. MQTT bedside IoT readiness: not yet implemented as a native listener; existing adapter architecture is extensible to MQTT ingestion.

The simulator is used for safe demo workflows, while live ingestion paths (HL7 and serial) are implemented for monitor-compatible pipelines.

## SECTION 7 — Risk Prediction Engine

Risk scoring inputs implemented in the live telemetry backend:

1. Heart rate
2. SpO2
3. Temperature
4. Blood pressure

Weighted aggregation logic (implemented):

RiskScore = clamp(S_SpO2 + S_HR + S_Temp + S_BP + P_combo, 0, 100)

Where component scores and penalties are rule-based and severity-sensitive (including multi-signal deterioration penalties).

Severity classification ranges in production route:

1. `0-24` -> `STABLE`
2. `25-49` -> `WARNING`
3. `50-74` -> `MODERATE`
4. `75-100` -> `CRITICAL`

## SECTION 8 — Forecasting Engine

Implemented forecasting behavior:

1. Next-5-minute deterioration prediction: served by `/api/v1/forecast/next` and consumed by Node + dashboard.
2. Trend direction detection: exposed in UI (`increase`, `stable`, `decrease`) by comparing current risk to predicted category.
3. Confidence scoring exposure: displayed in frontend as category-based confidence indicator.
4. XGBoost forecasting service: Flask `ForecastService` loads scaler + XGBoost model (`xgb_forecasting.json`) when enabled.

When ML service is unavailable or disabled, the backend uses deterministic heuristic fallback forecasting.

## SECTION 9 — Identity Collision Resolver

Identity collision handling is implemented to protect continuity:

1. Monitor ID conflicts are detected against existing monitor-to-patient bindings.
2. Deterministic fallback identifiers are generated when explicit identity is missing or colliding.
3. State continuity is preserved by binding monitor context and signature-derived fallback IDs rather than reassigning active patient streams unsafely.

## SECTION 10 — Hex Telemetry Decoder

Hex decoding implementation includes:

1. Payload parsing and sanitation of hex packet content.
2. Packet reconstruction from fixed frame chunks and fragment assembly (analytics service).
3. Byte-to-vital mapping through physiologic ID maps.
4. Structured normalization into heart rate, SpO2, temperature, blood pressure, plus decode warnings.

## SECTION 11 — Voice Assistant Layer

Voice assistant pipeline in this repository:

1. Speech-to-text workflow: Sarvam STT with language fallback handling.
2. Intent classification: Groq model path with heuristic fallback when unavailable.
3. Patient summary generation: pulls live patient summary context and generates concise spoken response.
4. Text-to-speech broadcast: Sarvam TTS output plus LiveKit broadcast for near-real-time delivery.

## SECTION 12 — WhatsApp Escalation Support

WhatsApp escalation support is implemented as an optional integration:

1. Critical alert forwarding: escalation dispatcher can send formatted critical alert messages to configured recipients.
2. Remote doctor query workflow readiness: webhook endpoint exists and accepts payloads; inbound command workflows are scaffolded (TODO markers in webhook route).
3. Dashboard-independent escalation channel: alerts can be pushed externally even when users are not on dashboard screens.

If credentials are missing, integration reports `inactive` and escalation pipeline continues without runtime failure.

## SECTION 13 — Timeline Intelligence Layer

Timeline intelligence is implemented through persisted event streams and timeline APIs:

1. Risk transitions: telemetry events and derived stability transitions are tracked over time.
2. Alert history: alert events include delivery status, reason, and delivery channels.
3. Telemetry evolution tracking: historical vitals are queryable and visualized through timeline components.

### Example Alert Event Object

```json
{
	"patientId": "205",
	"severity": "CRITICAL",
	"trigger": "SpO2 below threshold",
	"deliveryChannels": ["dashboard","voice","whatsapp"],
	"timestamp": "2026-04-11T10:32:00Z"
}
```

Alert events are persisted and streamed through escalation channels for real-time clinical response coordination.

## SECTION 14 — API Platform Layer

API platform implementation includes:

1. Developer API key generation: `/api-key/my-key` (with auto-create behavior) and `/api-key/regenerate`.
2. Usage quota enforcement: per-day usage counted from `api_usage_logs` against plan limits.
3. Secured ingestion endpoints: telemetry/voice/integration routes are protected by API key middleware.
4. External hospital integration readiness: typed HTTP API surface, auth, and transport adapters support external system integration workflows.

## SECTION 15 — Simulator Engine

Simulator capabilities implemented:

1. Synthetic telemetry generator: backend simulator service and Python telemetry simulator tool.
2. Reproducible deterioration scenarios: deterministic demo seed path exists in stability timeline workflow; continuous simulator provides ongoing randomized load.
3. Safe offline demo pipeline: full dashboard/voice/timeline flows can be demonstrated without bedside monitor dependency.

## SECTION 16 — API Surface Documentation

Detected and implemented endpoint surface requested:

| Endpoint | Method | Service |
|---|---|---|
| `/telemetry/update` | `POST` | Express telemetry backend |
| `/api/v1/telemetry/ingest` | `POST` | Flask analytics backend |
| `/api/v1/patients` | `GET` | Flask analytics backend |
| `/api/v1/alerts` | `GET` | Flask analytics backend |
| `/api/v1/forecast/next` | `POST` | Flask analytics backend |
| `/icu/summary` | `GET` | Express summary route |
| `/icu/timeline` | `GET` | Express timeline route |
| `/api/v1/analysis/triage` | `POST` | Flask analytics backend |
| `/voice/query` | `POST` | Express voice route |
| `/voice/token` | `GET` | Express voice route |
| `/api-key/my-key` | `GET` | Express API key route |
| `/integration/status` | `GET` | Express integration route |
| `/integration/test-whatsapp-alert` | `GET` | Express integration route |

### Example Telemetry Payload

POST /telemetry/update

Example request:

```json
{
	"patientId": "205",
	"heartRate": 142,
	"spo2": 79,
	"temperature": 39.4,
	"bloodPressure": "90/60"
}
```

This payload demonstrates structured bedside telemetry ingestion used for live risk scoring and escalation triggering.

### Example Forecast Response

POST /api/v1/forecast/next

Example response:

```json
{
	"patientId": "205",
	"predictedRisk": "CRITICAL",
	"confidence": 0.87,
	"trend": "increasing"
}
```

This response illustrates near-term deterioration prediction generated by the forecasting engine.

## SECTION 17 — Security Model

Security controls implemented in code:

1. API key authentication: protected routes require `x-api-key` and hashed key lookup.
2. Usage limits: daily quota enforcement per key and plan.
3. Expiration enforcement: expired keys are blocked.
4. Inactive key blocking: non-active keys are denied.

Additional controls present:

1. Supabase persistence for key metadata and usage logs.
2. Protected-path auth middleware in both Express and Flask API layers.
3. Supabase RLS policies for core clinical event tables.

## SECTION 18 — Evaluation Metrics

Evaluation metrics used in the repository workflow:

1. Accuracy
2. Precision
3. Recall
4. F1 score
5. ROC-AUC

Current implementation notes:

1. Accuracy, precision, recall, and F1 are computed and displayed by the model evaluation section in the dashboard.
2. ROC-AUC is included as a required clinical evaluation metric target; it is not currently computed in the same UI component.
3. Recall is prioritized for ICU safety because missing a true deterioration case is clinically higher risk than investigating an extra alert.

## SECTION 19 — Demo Workflow for Judges

1. Generate API key
Use `/api-key/my-key` (or dashboard API access page) with a user identifier.

2. Send telemetry
Post telemetry to `/telemetry/update` with either structured vitals or hex payload path.

3. Observe alert trigger
Send critical-range vitals and verify escalation channels in response payload and timeline events.

4. View forecast widget
Open dashboard forecast widgets/projections and confirm next-step risk state output.

5. Inspect timeline transitions
Review `/icu/timeline`-backed panels for telemetry evolution and alert history.

6. Test voice query
Use `/voice/query` or chat page to request patient status and ICU summary context.

7. Verify WhatsApp escalation readiness
Check `/integration/whatsapp-status` and trigger `/integration/test-whatsapp-alert` for active environments.

## SECTION 20 — Deployment Instructions

Minimal setup path:

1. Install dependencies
```bash
npm --prefix server install
npm --prefix client install
pip install -r requirements.txt
pip install -r requirements-ml.txt
```

2. Configure environment
Copy `.env.example` to `.env` and set required keys (`SUPABASE_*`, `LIVEKIT_*`, `SARVAM_API_KEY`, `GROQ_API_KEY`).

3. Apply Supabase schema
```bash
supabase link --project-ref <project-ref>
supabase db query --linked -f server/supabase/patient_schema.sql
```

4. Run stack
```bash
npm run start:stack
```

5. Run frontend (if not using dockerized frontend)
```bash
npm --prefix client run dev
```

6. Optional Docker deployment
```bash
docker compose up --build -d
```

## SECTION 21 — Future Scope

1. Multi-hospital deployment with tenant isolation and centralized observability.
2. EHR integration for standardized clinical record synchronization.
3. Edge-device ingestion extensions beyond current HL7/serial adapters.
4. Federated learning upgrades for cross-site model improvement without centralized raw data pooling.

## SECTION 22 — License

MIT

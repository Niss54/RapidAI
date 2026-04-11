# Rapid AI – ICU Early Warning Intelligence Platform

SECTION 1: What is Rapid AI?

Rapid AI is a real-time ICU intelligence system that transforms incoming bedside monitor data into clear, actionable clinical guidance. Instead of showing only raw numbers, it decodes data, maps devices to the right patient, predicts deterioration risk, and supports fast escalation through alerts and voice interaction.

Glossary:
- Telemetry {real-time vital signals}
- Risk Score {numerical deterioration probability}
- Alert Escalation {automatic doctor notification workflow}
- Forecasting {prediction of near-future patient condition}

SECTION 2: Problem We Solved

ICU teams often face fragmented monitoring and delayed intervention.

Key challenges:
- Device conflicts: one monitor can be linked to the wrong patient record.
- Late alerts: warning signs are sometimes detected after condition worsens.
- Language barriers: staff communication can slow down in mixed-language workflows.
- Lack of prediction: many systems show current status only, not likely next state.

Rapid AI addresses these gaps with an end-to-end telemetry-to-intelligence pipeline.

SECTION 3: How Our System Works (Pipeline Explanation)

1. Telemetry Input {raw monitoring data}
   The system receives patient vitals from structured feeds and encoded telemetry streams.

2. Hex Decoder {converts encoded signals into vitals}
   It parses hexadecimal packets and reconstructs values like heart rate, SpO2, temperature, and blood pressure.

3. Identity Resolver {maps monitors to correct patients}
   It resolves monitor-patient mapping conflicts and applies deterministic fallback mapping when metadata is incomplete.

4. Risk Engine {computes deterioration score}
   It calculates a normalized risk score and severity level using current physiological signals.

5. Forecast Engine {predicts near-future condition}
   It estimates next-5-minute deterioration probability and trend direction.

6. Alert Engine {triggers warnings}
   It raises severity-aware alerts with cooldown controls to avoid noise and duplicates.

7. Timeline Engine {shows condition transitions}
   It tracks risk movement, telemetry events, and alert history over time.

8. Voice Assistant {doctor interaction layer}
   It supports multilingual command interaction and spoken response for quick bedside decisions.

SECTION 4: Frontend Dashboard Explanation

- Hex Decoder Panel
  Shows decoded vitals from incoming hexadecimal payloads and helps validate packet interpretation.

- Identity Mapping Panel
  Displays monitor-to-patient resolution with strategy and timestamp for conflict traceability.

- Alerts Timeline
  Presents alert events in chronological sequence with severity and delivery context.

- Forecast Widget
  Shows near-term risk prediction, trend direction, and confidence percentage.

- Telemetry Graph
  Visualizes risk and vitals movement over time for quick trend recognition.

- ICU Summary Panel
  Provides live distribution of patients across severity states.

- Voice Logs Panel
  Captures query, intent, language, and response history for voice interactions.

- LiveKit Status Badge
  Indicates real-time communication readiness for audio broadcast workflows.

- Risk Breakdown Panel
  Explains which vital components are contributing most to the current risk level.

- Simulator Toggle
  Starts or stops synthetic telemetry generation for controlled demo and testing.

- Patient Detail Page
  Gives a full patient drilldown view including vitals, timeline, alerts, forecast, and voice logs.

- Triage Insights Panel
  Displays triage priority, recommended escalation, and a concise risk explanation summary.

SECTION 5: Risk Score Logic Explained

Rapid AI computes a 0-100 risk score using weighted vital-sign contributions.

- SpO2 contribution
  Lower oxygen saturation increases risk sharply because hypoxia can deteriorate quickly.

- Heart Rate contribution
  Very high or very low heart rate contributes to instability scoring.

- Temperature contribution
  Abnormal temperature trends add clinical risk context for infection or systemic stress.

- Blood Pressure contribution
  Extreme systolic or diastolic patterns increase risk due to perfusion instability.

All contributions are aggregated into a single interpretable score for escalation readiness.

SECTION 6: Stability Transition Timeline

The timeline classifies state movement into clear categories:

- Stable {safe condition}
- Warning {moderate concern}
- Critical {high deterioration risk}

This helps clinicians see whether a patient is improving, stable, or worsening over time.

SECTION 7: Forecast Prediction Module

The forecasting module predicts likely patient condition in the next 5 minutes using current vitals, recent trend behavior, and model/rule outputs.

Confidence indicator meaning:
- Higher confidence means the model sees stronger consistency in current deterioration pattern.
- Lower confidence means greater uncertainty, so teams should monitor more closely with clinical judgment.

SECTION 8: Alert Automation System

Rapid AI alert automation includes:
- severity detection
- cooldown logic
- duplicate suppression
- audio broadcast alerts

The system prioritizes urgent events while reducing repeated low-value notifications.

SECTION 9: Voice Assistant

Rapid AI supports multilingual ICU interaction so doctors and nurses can query without typing.

Workflow includes:
- Hindi commands
- English commands
- intent classification
- spoken response output

This improves speed and accessibility during high-pressure situations.

SECTION 10: Timeline Intelligence

Timeline intelligence combines multiple event streams into one clinical sequence:
- event tracking
- alert tracking
- risk evolution tracking

It provides context for handover, audit, and escalation decisions.

SECTION 11: Simulator Engine

Synthetic telemetry is used to safely test full pipeline behavior without relying on live ICU devices. It supports reproducible demos, stress scenarios, and rapid validation of alert and forecast logic.

SECTION 12: APIs Used

- POST /telemetry/update
  Ingests telemetry, computes risk, updates patient state, and returns alert/forecast context.

- POST /api/v1/telemetry/ingest
  Decodes and normalizes telemetry payloads in analytics services.

- GET /api/v1/patients
  Returns active patient states and monitoring context.

- GET /api/v1/alerts
  Returns recent alert events for operational tracking.

- POST /api/v1/forecast/next
  Produces next-step deterioration forecast from latest telemetry context.

- GET /icu/summary
  Provides ICU-wide severity distribution and patient snapshot.

- GET /icu/timeline
  Returns historical telemetry and alert timeline records.

- POST /api/v1/analysis/triage
  Returns triage priority, escalation recommendation, and risk explanation.

- POST /voice/query
  Processes clinician voice/text query and returns structured response.

- GET /voice/token
  Generates realtime voice session token for LiveKit.

SECTION 13: Technology Stack

- Frontend
  Next.js + React dashboard with real-time operational UI modules.

- Backend
  Express-based telemetry and workflow orchestration layer.

- ML
  Forecasting and risk analytics services with model-assisted prediction.

- Voice
  Sarvam speech processing and Groq-based intent understanding.

- Database
  Supabase-backed persistence for patient state, telemetry, alerts, and voice logs.

- Realtime Layer
  LiveKit channel for low-latency voice and broadcast interactions.

SECTION 14: Why This Solution Is Unique

Rapid AI is unique because it combines:
- hex decoding
- identity resolution
- forecast prediction
- voice ICU interaction
- timeline intelligence

Most solutions provide dashboards; Rapid AI provides an operational intelligence loop.

SECTION 15: Real Hospital Impact

Rapid AI can deliver measurable bedside impact:
- faster escalation
- reduced mortality risk
- language accessibility
- continuous monitoring

The platform helps teams act earlier and with better context.

SECTION 16: Demo Script For Judges

1. Start the dashboard and confirm services are healthy.
2. Push structured telemetry and observe live patient updates.
3. Push hex telemetry and verify decoder output.
4. Observe risk score changes and automatic alert behavior.
5. Open forecast widget and review next-5-minute prediction with confidence.
6. Open timeline views to inspect transitions and event chronology.
7. Trigger voice query in Hindi and English and validate spoken response.
8. Open patient detail page and triage insights panel for drilldown validation.
9. Start simulator and observe continuous automated telemetry flow.

SECTION 17: Future Scope

Deployment roadmap:
- hospital EHR integration for richer longitudinal context
- edge telemetry gateways for direct bedside device ingestion
- multi-hospital deployment with tenant-safe architecture
- federated clinical learning for model improvement across sites

Rapid AI demonstrates a complete, practical ICU early warning intelligence platform built for proactive care operations. Thank you for your evaluation.

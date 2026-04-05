# Rapid AI Architecture Image Prompt

Use this prompt in Midjourney, Flux, SDXL, Leonardo, or similar image generation tools.

## Master Prompt

Create a premium hackathon architecture poster for a healthcare AI platform called Rapid AI - Syntrix ICU Voice Copilot.

Style: modern enterprise infographic, high contrast, dark navy background with cyan and emerald accents, clean grid layout, thin neon connector lines, subtle glow around active pipelines, crisp typography, no clutter, technical but judge-friendly, realistic UI cards, 16:9 ratio, ultra high detail, presentation-ready.

Title area:
- Main title: Rapid AI ICU Voice Copilot
- Subtitle: Real-time patient risk detection, multilingual voice response, and clinical timeline intelligence

Show these architecture blocks with icons and directional arrows:

1) Clinical Users Layer
- Doctors
- Nurses
- ICU Operator Dashboard

2) Frontend Experience Layer (Next.js)
- Home page
- Chat + Voice console
- ICU Dashboard with risk cards and timeline

3) API Orchestration Layer (Node.js + Express)
- /telemetry/update
- /voice/query
- /voice/token
- /voice/languages
- /voice/alert-state
- /icu/summary
- /icu/timeline

4) AI and Voice Intelligence Layer
- Risk Analyzer (rule engine)
- LLM Intent Router (Groq + fallback heuristics)
- STT Service (Sarvam)
- TTS Service (Sarvam)
- Alert Speaker with lock mode
- Session State Manager (language + intro + alert lock)

5) Real-time Communication Layer
- LiveKit token service
- Voice/data broadcast channel

6) Data and Persistence Layer (Supabase)
- patients table
- telemetry_events
- alert_events
- voice_interactions
- RLS policies
- retention cleanup

7) Simulation and Ops Layer
- telemetry_simulator.py
- smoke test runner
- docker compose deployment

8) Monitoring and Reliability Callouts
- multilingual support (EN, HI, BN, TA, TE, MR, GU, KN, ML, PA, UR, OR)
- fallback when LLM unavailable
- alert-first blocking behavior during critical incidents
- API health checks

Flow annotations to display on arrows:
- Vitals Ingest -> Risk Score -> Alert Decision
- Text/Audio Query -> Intent Detection -> Response Generation
- Response Text -> TTS -> LiveKit Broadcast
- Every event -> Supabase timeline

Visual requirements:
- Use distinct color coding per layer
- Add small legend on bottom right
- Include 3 KPI chips near title: Faster Triage, Voice-First ICU, Real-Time Alerts
- Keep all labels readable at slide projection size
- Do not use cartoons, avoid generic stock imagery
- No watermark

Output: one polished architecture board suitable for hackathon final judging deck.

## Optional Negative Prompt

blurry text, distorted labels, low resolution, cluttered composition, cartoon style, watermark, random icons, duplicate arrows, illegible font, oversaturated neon, medical gore

## Suggested Generation Settings

- Aspect ratio: 16:9
- Quality: high or max
- Stylization: medium
- Seed: fixed after first good draft for consistency

## Variant Prompt (Light Theme)

Create the same architecture poster but with a clean white background, blue and teal accent palette, subtle shadows, and boardroom presentation style.

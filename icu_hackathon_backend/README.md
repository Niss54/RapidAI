# Syntrix ICU Voice Copilot

AI-powered platform that helps ICU teams detect critical patient deterioration, trigger multilingual voice responses, and track clinical event history in real time using a voice-first AI orchestration stack.

Project Team Name: Team Syntrix

Repository Link: REPOSITORY_LINK
Deployment Link: DEPLOYMENT_LINK

## ✨ Features

| Feature | Description |
|---|---|
| Real-time ICU telemetry ingestion | Accepts live vitals and updates patient state continuously through API ingestion loops. |
| AI risk decision pipeline | Rule-based risk engine classifies CRITICAL, MODERATE, WARNING, STABLE from incoming vitals. |
| Voice-enabled doctor assistant | Supports text and audio queries for patient status and ICU summary workflows. |
| LLM intent orchestration | Uses Groq (Llama) for command intent classification with resilient heuristic fallback. |
| Multilingual responses | English and Hindi response switching is supported in conversational flow. |
| STT + TTS voice modules | Sarvam APIs handle speech-to-text and text-to-speech response generation. |
| Live voice broadcast channel | LiveKit tokens and room data events power real-time audio/data delivery. |
| ICU operations dashboard | Next.js dashboard provides telemetry push, voice controls, risk cards, and timeline UI. |
| Historical tracking timeline | Unified timeline surfaces telemetry events and alert events directly from Supabase. |
| Role-based data access | Supabase RLS policies enforce role-scoped access using JWT app_role claims. |
| Automated retention cleanup | Daily scheduled cleanup trims historical event tables with configurable retention. |
| Simulation automation | Python telemetry simulator continuously generates synthetic patient vitals for testing. |
| Optional analytics module | Legacy Flask module includes identity resolution, triage scoring, and optional forecasting endpoints. |

## 🏗️ Architecture

### System View

Users (Doctors / Nurses)
			|
			v
Next.js Dashboard (client)
	- Telemetry form
	- Voice controls
	- Timeline view
			|
			v
Express API (server)
	- /telemetry/update
	- /voice/query, /voice/token
	- /icu/summary, /icu/timeline
			|
			+-----------------------------+
			|                             |
			v                             v
AI + Voice Layer                Persistence Layer
	- Risk Analyzer                  - Supabase patients
	- Voice Controller               - telemetry_events
	- Groq Intent                    - alert_events
	- Sarvam STT/TTS                 - voice_interactions
	- LiveKit broadcast              - RLS + retention cron

### Agent and Decision Workflow

Telemetry -> Risk Analyzer -> Patient Upsert -> Critical Alert Decision
-> TTS Synthesis -> LiveKit Broadcast -> Event Logging -> Timeline API

Voice Query (text/audio) -> STT (if audio) -> Intent Detection (Groq/heuristic)
-> Patient/Summary Resolution -> TTS -> LiveKit Broadcast -> Voice Event Logging

## 🔌 API Surface

### Active Voice Backend (Node.js + Express)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /health | Service health check |
| POST | /telemetry/update | Ingest telemetry, classify risk, trigger critical alerts |
| GET | /voice/token | Generate LiveKit room token |
| POST | /voice/query | Process doctor query via text/audio voice workflow |
| GET | /icu/summary | ICU risk distribution + patient snapshot |
| GET | /icu/timeline | Historical telemetry + alert event timeline |

### Legacy Analytics API (Flask, optional module under src)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /health | Legacy module health and forecast readiness |
| POST | /api/v1/telemetry/ingest | Decodes telemetry payloads and computes risk score |
| GET | /api/v1/patients | Patient state listing |
| GET | /api/v1/patients/{patient_id} | Detailed patient state |
| GET | /api/v1/alerts | Recent alerts feed |
| POST | /api/v1/analysis/triage | Rule-based triage insights |
| POST | /api/v1/forecast/next | Optional forecasting endpoint |

## 🛠️ Tech Stack

### Frontend
- Next.js 16
- React 19
- Tailwind CSS 4
- LiveKit client SDK

### Backend / Agents
- Node.js
- Express.js
- Modular service orchestration (risk analyzer, voice controller, alert speaker)

### AI Models
- Groq LLM (Llama family) for intent classification
- Rule-based fallback intent engine (offline resilience)

### Automation
- Python telemetry simulator loop
- Supabase scheduled retention cleanup (pg_cron)

### External APIs
- LiveKit (real-time room/data channel)
- Sarvam (STT/TTS)
- Supabase (Postgres + RLS + auth claims)

### Infra / Hosting
- No provider-specific deployment files committed in repo
- Deployable to any standard Node + Next hosting stack

## 🚀 Getting Started

### 0) Required Accounts and API Keys

Create these accounts before setup:

| Provider | Required Keys / Values | Why Needed |
|---|---|---|
| Supabase | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, project-ref | Database, timeline storage, RLS, schema deploy |
| LiveKit | LIVEKIT_API_KEY, LIVEKIT_SECRET, LIVEKIT_WS_URL (or LIVEKIT_URL) | Real-time room token + event broadcast |
| Sarvam AI | SARVAM_API_KEY | Speech-to-text and text-to-speech |
| Groq | GROQ_API_KEY (optional but recommended), GROQ_MODEL | LLM intent detection for voice commands |

Note: Groq key optional hai, but without it app heuristic fallback pe chalega.

### 1) Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+ (simulator + optional legacy module)
- Supabase CLI

### 2) Open project in terminal

```powershell
Set-Location c:\ICU\icu_hackathon_backend
```

### 3) Install dependencies

```powershell
npm --prefix server install
npm --prefix client install
```

Optional legacy analytics module:

```powershell
pip install -r requirements.txt
pip install -r requirements-ml.txt
```

### 4) Create and configure env files

```powershell
Copy-Item .env.example .env
Copy-Item client/.env.local.example client/.env.local
```

Set these minimum server keys inside .env:

```env
SERVER_PORT=4000

LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_SECRET=your_livekit_secret
LIVEKIT_WS_URL=wss://your-livekit-domain
LIVEKIT_HOST=https://your-livekit-domain

SARVAM_API_KEY=your_sarvam_api_key
SARVAM_STT_URL=https://api.sarvam.ai/speech-to-text
SARVAM_TTS_URL=https://api.sarvam.ai/text-to-speech
SARVAM_VOICE=anushka

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

Set client keys inside client/.env.local:

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_WS_URL=wss://your-livekit-domain
```

### 5) Setup Supabase schema (first-time mandatory)

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db query --linked -f server/supabase/patient_schema.sql
```

Optional verification:

```powershell
supabase db query --linked "select table_name from information_schema.tables where table_schema='public' and table_name in ('patients','telemetry_events','alert_events','voice_interactions');"
```

### 6) Run all services (recommended 3 terminals)

Terminal 1 (backend):

```powershell
npm --prefix server start
```

Terminal 2 (frontend):

```powershell
npm --prefix client run dev
```

Terminal 3 (simulated live vitals, optional but useful):

```powershell
python server/tools/telemetry_simulator.py
```

App URLs:

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

### 7) Quick smoke test commands

```powershell
Invoke-RestMethod -Uri http://localhost:4000/health -Method Get
Invoke-RestMethod -Uri http://localhost:4000/icu/summary -Method Get
Invoke-RestMethod -Uri http://localhost:4000/icu/timeline -Method Get
```

Send telemetry sample:

```powershell
$body = @{ patientId='101'; heartRate=124; spo2=83; temperature=101.2; bloodPressure='130/90' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/telemetry/update -Method Post -Body $body -ContentType 'application/json'
```

Voice query sample:

```powershell
$q = @{ text='status of patient 101'; language='en' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/voice/query -Method Post -Body $q -ContentType 'application/json'
```

### 8) Optional legacy analytics backend (Flask)

```powershell
python run.py
```

Legacy module env (only if you plan to run src/icu_backend stack):

- APP_NAME
- APP_HOST
- APP_PORT
- DEBUG
- API_PREFIX
- CORS_ORIGINS
- API_KEY
- MAX_HISTORY
- ALERT_COOLDOWN_SECONDS
- FORECAST_ENABLED
- FORECAST_MODEL_PATH
- FORECAST_SCALER_PATH

### 9) Common setup issues

- Error: "Could not find table public.patients": run Supabase schema step again.
- Error: LiveKit token or room issue: verify LIVEKIT_API_KEY, LIVEKIT_SECRET, LIVEKIT_WS_URL.
- Error: no audio response: verify SARVAM_API_KEY and endpoints.
- Error: intent not detecting well: verify GROQ_API_KEY (otherwise heuristic fallback is used).

## 🌐 Deployment

No hardcoded platform-specific deployment manifest is present, so deployment is platform-agnostic.

### Frontend deployment
- Build command: npm --prefix client run build
- Start command: npm --prefix client run start
- Set NEXT_PUBLIC_SERVER_URL and NEXT_PUBLIC_LIVEKIT_WS_URL

### Backend deployment
- Start command: npm --prefix server start
- Expose port from SERVER_PORT
- Configure .env secrets for LiveKit, Sarvam, Groq, Supabase

### Agent deployment
- Telemetry simulator can run as a worker/cron process:
	python server/tools/telemetry_simulator.py

### Cloud setup checklist
1. Create Supabase project and run schema file
2. Configure LiveKit host and API credentials
3. Configure Sarvam API key and voice endpoints
4. Configure Groq key/model
5. Wire frontend env to backend URL

### Secrets configuration
- Never commit production secrets
- Use environment secret managers in your host platform
- Rotate keys regularly for Groq, Sarvam, LiveKit, and Supabase

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| SERVER_PORT | No | Port for Express voice backend (default 4000). |
| SUPABASE_URL | Yes | Supabase project URL for persistence and timeline queries. |
| SUPABASE_SERVICE_ROLE_KEY | Yes (recommended) | Server-side privileged key for inserts and management operations. |
| SUPABASE_ANON_KEY | Optional | Fallback key path in client initialization logic. |
| LIVEKIT_API_KEY | Yes | LiveKit API key for token generation and server room actions. |
| LIVEKIT_SECRET | Yes | Primary LiveKit secret used by backend signing flow. |
| LIVEKIT_API_SECRET | Optional | Backward-compatible alias accepted by backend. |
| LIVEKIT_WS_URL | Yes | LiveKit websocket URL returned to frontend token consumers. |
| LIVEKIT_HOST | Optional | LiveKit HTTP host used by RoomServiceClient. |
| LIVEKIT_URL | Optional | Backward-compatible URL alias accepted by backend. |
| SARVAM_API_KEY | Yes | Credential for Sarvam STT and TTS requests. |
| SARVAM_STT_URL | Optional | Override STT endpoint URL. |
| SARVAM_TTS_URL | Optional | Override TTS endpoint URL. |
| SARVAM_VOICE | Optional | Voice preset for synthesized responses. |
| GROQ_API_KEY | Optional | Groq key for LLM intent routing; fallback heuristics run if missing. |
| GROQ_MODEL | Optional | Groq model override (default llama-3.3-70b-versatile). |
| NEXT_PUBLIC_SERVER_URL | Yes | Frontend base URL for backend API calls. |
| NEXT_PUBLIC_LIVEKIT_WS_URL | Yes | Frontend LiveKit websocket URL for room connection. |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY | No | Present in env file but not required by active client code path. |
| APP_NAME | Optional (legacy Flask module) | Display name for legacy analytics service. |
| APP_HOST | Optional (legacy Flask module) | Host binding for legacy Flask server. |
| APP_PORT | Optional (legacy Flask module) | Port for legacy Flask server. |
| DEBUG | Optional (legacy Flask module) | Debug mode flag for Flask app. |
| API_PREFIX | Optional (legacy Flask module) | Route prefix for legacy API endpoints. |
| CORS_ORIGINS | Optional (legacy Flask module) | Allowed CORS origins list. |
| API_KEY | Optional (legacy Flask module) | Header-based API key protection for legacy endpoints. |
| MAX_HISTORY | Optional (legacy Flask module) | In-memory history window for risk processing. |
| ALERT_COOLDOWN_SECONDS | Optional (legacy Flask module) | Cooldown to suppress duplicate alerts. |
| FORECAST_ENABLED | Optional (legacy Flask module) | Enables/disables ML forecasting service. |
| FORECAST_MODEL_PATH | Optional (legacy Flask module) | Path to XGBoost model artifact. |
| FORECAST_SCALER_PATH | Optional (legacy Flask module) | Path to scaler artifact used by forecast module. |

## 📁 Project Structure

icu_hackathon_backend/
├── client/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   └── lib/
│   │       └── api.ts
│   └── package.json
├── server/
│   ├── app.js
│   ├── models/
│   │   ├── Patient.js
│   │   └── EventLog.js
│   ├── routes/
│   │   ├── telemetry.js
│   │   ├── voice.js
│   │   └── summary.js
│   ├── services/
│   │   ├── riskAnalyzer.js
│   │   ├── voiceController.js
│   │   ├── livekitService.js
│   │   ├── sttService.js
│   │   ├── ttsService.js
│   │   ├── llmService.js
│   │   ├── alertSpeaker.js
│   │   └── supabaseClient.js
│   ├── supabase/
│   │   └── patient_schema.sql
│   ├── tools/
│   │   └── telemetry_simulator.py
│   └── package.json
├── src/
│   └── icu_backend/
│       ├── api/routes/
│       ├── services/
│       ├── assets/
│       └── main.py
├── run.py
├── requirements.txt
├── requirements-ml.txt
└── README.md

## 📜 License

MIT License

Copyright (c) 2026 Nishant Maurya 

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 🙏 Acknowledgments

- Groq for LLM inference APIs
- Sarvam for speech-to-text and text-to-speech services
- LiveKit for real-time communication infrastructure
- Supabase for Postgres, RLS, and scheduling ecosystem
- Next.js, React, and Express open-source communities
- Flask and scientific Python ecosystem (NumPy, scikit-learn, XGBoost)


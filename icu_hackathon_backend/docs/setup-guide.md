# Rapid AI Setup Guide

This guide contains complete operational setup details. The main README is intentionally judge-focused and concise.

## 1) Prerequisites

- Docker Desktop (recommended)
- Node.js 18+ and npm 9+ (for non-docker local run)
- Python 3.10+ (optional telemetry simulator)
- Supabase CLI

## 2) Accounts and Keys

| Provider | Required Keys |
|---|---|
| Supabase | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY |
| LiveKit | LIVEKIT_API_KEY, LIVEKIT_SECRET, LIVEKIT_WS_URL |
| Sarvam | SARVAM_API_KEY |
| Groq | GROQ_API_KEY, GROQ_MODEL (recommended) |

## 3) Docker Setup (recommended)

```powershell
Set-Location c:\ICU\icu_hackathon_backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
```

Check status:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

Stop stack:

```powershell
docker compose down
```

## 4) Local Setup Without Docker

Install dependencies:

```powershell
Set-Location c:\ICU\icu_hackathon_backend
npm --prefix server install
npm --prefix client install
```

Optional Python requirements:

```powershell
pip install -r requirements.txt
pip install -r requirements-ml.txt
```

Create env files:

```powershell
Copy-Item .env.example .env
New-Item -Path client/.env.local -ItemType File -Force
```

## 5) Minimum Environment Variables

Server .env:

```env
SERVER_PORT=4000
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_SECRET=your_livekit_secret
LIVEKIT_WS_URL=wss://your-livekit-domain
SARVAM_API_KEY=your_sarvam_api_key
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
```

Client .env.local:

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
NEXT_PUBLIC_LIVEKIT_WS_URL=wss://your-livekit-domain
```

Keep `NEXT_PUBLIC_SERVER_URL` aligned with `SERVER_PORT`. If you change one, update the other to the same port.

## 6) Supabase Schema Setup

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db query --linked -f server/supabase/patient_schema.sql
```

## 7) Manual Runtime Commands

Backend:

```powershell
npm --prefix server start
```

Frontend:

```powershell
npm --prefix client run dev
```

Optional simulator:

```powershell
python server/tools/telemetry_simulator.py
```

## 8) Smoke Tests

```powershell
Invoke-RestMethod -Uri http://localhost:4000/health -Method Get
Invoke-RestMethod -Uri http://localhost:4000/icu/summary -Method Get
Invoke-RestMethod -Uri http://localhost:4000/icu/timeline -Method Get
```

Telemetry test:

```powershell
$body = @{ patientId='101'; heartRate=124; spo2=83; temperature=101.2; bloodPressure='130/90' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/telemetry/update -Method Post -Body $body -ContentType 'application/json'
```

Voice test:

```powershell
$q = @{ text='status of patient 101'; language='en' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:4000/voice/query -Method Post -Body $q -ContentType 'application/json'
```

## 9) Troubleshooting

| Issue | Fix |
|---|---|
| failed to connect to docker API | Start Docker Desktop and wait for engine running state |
| port already allocated | Stop local process or update docker compose port mapping |
| frontend loads but APIs fail | Check backend logs and required .env values |
| backend exits at startup | Missing or invalid LiveKit/Sarvam/Supabase values |

# Mykare Voice Agent

An AI-powered front-desk voice agent for Mykare Health Clinic. Patients call in by browser, speak naturally, and the agent handles appointment booking, viewing, cancellation, and rescheduling — entirely by voice.

## What it does

The agent (Priya) greets the caller, collects their name and phone number, looks up their record, and fulfils their request using one of seven tools:

| Tool | Purpose |
|---|---|
| `identify_user` | Look up patient by phone number |
| `fetch_slots` | List available appointment slots |
| `book_appointment` | Book a new appointment |
| `retrieve_appointments` | View existing appointments |
| `cancel_appointment` | Cancel an appointment |
| `modify_appointment` | Reschedule an appointment |
| `end_conversation` | Wrap up and generate a call summary |

The UI shows a live avatar that reflects the agent's state (listening / thinking / responding), a real-time conversation transcript, a tool-activity panel, and an end-of-call summary card with duration and patient name.

## Tech stack

| Layer | Technology |
|---|---|
| Voice pipeline | [Pipecat](https://github.com/pipecat-ai/pipecat) 1.1.0 |
| Transport | WebRTC via `SmallWebRTCTransport` (aiortc, no Daily.co) |
| STT | Groq — `whisper-large-v3-turbo` |
| LLM | Anthropic — `claude-haiku-4-5-20251001` |
| TTS | OpenAI — `tts-1` / `nova` voice |
| VAD | Silero |
| Backend | FastAPI + Python 3.11 |
| Frontend | React + TypeScript + Vite |
| Database | SQLite (appointments & call summaries) |
| Deployment | Docker (multi-stage) — deployable to Render |

## Running locally

### Prerequisites

- Python 3.11+
- Node 20+
- API keys for OpenAI, Anthropic, and Groq

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_OPENAI_API_KEY=gsk_...
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`, click **Start Call**, allow microphone access, and speak.

> The frontend dev server proxies `/api` to `http://localhost:8000` — no extra config needed.

## Deploying to Render

The repo includes a `render.yaml` and a multi-stage `Dockerfile` that builds the React frontend and embeds it into the Python image.

1. Push the repo to GitHub.
2. In Render, create a new **Web Service** and connect the repo (or use **Blueprint** to pick up `render.yaml` automatically).
3. Set the following environment variables in Render:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI key |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `GROQ_OPENAI_API_KEY` | Your Groq key |

Render builds the Docker image and serves everything from a single container on port 8000.

### Optional: TURN relay

If WebRTC UDP is blocked on your network, add a TURN server (e.g. [Metered](https://www.metered.ca/)):

| Variable | Example value |
|---|---|
| `TURN_URL` | `turn:global.relay.metered.ca:80` |
| `TURN_USERNAME` | (from Metered dashboard) |
| `TURN_PASSWORD` | (from Metered dashboard) |

## Project structure

```
├── backend/
│   ├── main.py        # FastAPI app, WebRTC + WebSocket endpoints
│   ├── bot.py         # Pipecat pipeline (STT → LLM → TTS)
│   ├── tools.py       # 7 appointment management tools
│   ├── prompt.py      # System prompt for Priya
│   ├── database.py    # SQLite helpers
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── hooks/useVoiceAgent.ts   # WebRTC + WebSocket logic
│       └── components/
│           ├── Avatar.tsx           # Animated speaking avatar
│           ├── Transcript.tsx       # Chat-style conversation view
│           └── ToolStatus.tsx       # Live tool activity panel
├── Dockerfile         # Multi-stage build (Node → Python)
└── render.yaml        # Render deployment config
```

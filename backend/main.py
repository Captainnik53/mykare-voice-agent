import os
import uuid

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger

from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    IceServer,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

import database as db
from bot import run_bot

load_dotenv()
db.init_db()

app = FastAPI(title="Mykare Voice Agent API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure STUN/TURN so aiortc can discover its public IP behind cloud NAT.
# Set TURN_URL / TURN_USERNAME / TURN_PASSWORD env vars for relay support.
_ice_servers: list[IceServer] = []
_stun = os.getenv("STUN_URL", "stun:stun.l.google.com:19302")
if _stun:
    _ice_servers.append(IceServer(urls=_stun))
_turn_url = os.getenv("TURN_URL")
if _turn_url:
    _ice_servers.append(IceServer(
        urls=_turn_url,
        username=os.getenv("TURN_USERNAME", ""),
        credential=os.getenv("TURN_PASSWORD", ""),
    ))

webrtc_handler = SmallWebRTCRequestHandler(ice_servers=_ice_servers or None)

# session_id -> list of live WebSocket connections
_ws_clients: dict[str, list[WebSocket]] = {}


async def _broadcast(session_id: str, event: dict):
    dead: list[WebSocket] = []
    for ws in _ws_clients.get(session_id, []):
        try:
            await ws.send_json(event)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _ws_clients[session_id].remove(ws)


# ---------------------------------------------------------------------------
# WebSocket — real-time tool & summary events
# ---------------------------------------------------------------------------

@app.websocket("/ws/{session_id}")
async def ws_events(websocket: WebSocket, session_id: str):
    await websocket.accept()
    _ws_clients.setdefault(session_id, []).append(websocket)
    logger.info(f"WS connected | session={session_id}")
    try:
        while True:
            await websocket.receive_text()  # keep-alive ping/pong
    except WebSocketDisconnect:
        _ws_clients.get(session_id, []).remove(websocket)
        logger.info(f"WS disconnected | session={session_id}")


# ---------------------------------------------------------------------------
# WebRTC — voice pipeline
# ---------------------------------------------------------------------------

@app.post("/api/offer")
async def offer(request: SmallWebRTCRequest, background_tasks: BackgroundTasks):
    session_id = (request.request_data or {}).get("session_id") or str(uuid.uuid4())

    async def event_callback(event: dict):
        await _broadcast(session_id, event)

    async def on_connection(connection: SmallWebRTCConnection):
        background_tasks.add_task(run_bot, connection, session_id, event_callback)

    answer = await webrtc_handler.handle_web_request(
        request=request,
        webrtc_connection_callback=on_connection,
    )
    if isinstance(answer, dict):
        answer["session_id"] = session_id
    else:
        answer = {**answer.model_dump(), "session_id": session_id}
    return answer


@app.patch("/api/offer")
async def ice(request: SmallWebRTCPatchRequest):
    await webrtc_handler.handle_patch_request(request)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# REST helpers
# ---------------------------------------------------------------------------

@app.get("/api/summary/{session_id}")
async def get_summary(session_id: str):
    data = db.get_summary(session_id)
    if data:
        return data
    return JSONResponse({"error": "Not found"}, status_code=404)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve built React frontend (production only — when ./static dir exists)
# ---------------------------------------------------------------------------

_STATIC = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(_STATIC):
    _assets = os.path.join(_STATIC, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        candidate = os.path.join(_STATIC, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_STATIC, "index.html"))

import os
from datetime import datetime

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMContextFrame,
    TextFrame,
    TranscriptionFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.groq.stt import GroqSTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.services.tts_service import TextAggregationMode
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from prompt import SYSTEM_PROMPT
from tools import AppointmentTools, get_tools_schema

load_dotenv()


class UserTranscriptRelay(FrameProcessor):
    """Forwards user speech transcriptions to the WebSocket sidecar."""
    def __init__(self, event_cb):
        super().__init__()
        self._cb = event_cb

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            try:
                await self._cb({
                    "type": "user_transcript",
                    "data": {"text": frame.text.strip()},
                    "ts": datetime.now().isoformat(),
                })
            except Exception:
                pass


class BotTranscriptRelay(FrameProcessor):
    """Accumulates LLM output and sends complete bot turns to the WebSocket sidecar."""
    def __init__(self, event_cb):
        super().__init__()
        self._cb = event_cb
        self._buf = ""
        self._active = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, LLMFullResponseStartFrame):
            self._buf = ""
            self._active = True
        elif self._active and isinstance(frame, TextFrame) and direction == FrameDirection.DOWNSTREAM:
            self._buf += frame.text
        elif isinstance(frame, LLMFullResponseEndFrame) and self._active:
            self._active = False
            if self._buf.strip():
                try:
                    await self._cb({
                        "type": "bot_transcript",
                        "data": {"text": self._buf.strip()},
                        "ts": datetime.now().isoformat(),
                    })
                except Exception:
                    pass
                self._buf = ""


async def run_bot(connection: SmallWebRTCConnection, session_id: str, event_callback):
    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    stt = GroqSTTService(
        api_key=os.getenv("GROQ_OPENAI_API_KEY"),
        model="whisper-large-v3-turbo",
    )

    tts = OpenAITTSService(
        api_key=os.getenv("OPENAI_API_KEY"),
        text_aggregation_mode=TextAggregationMode.SENTENCE,
        settings=OpenAITTSService.Settings(voice="nova", model="tts-1"),
    )

    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        settings=AnthropicLLMService.Settings(model="claude-haiku-4-5-20251001"),
    )

    appointment_tools = AppointmentTools(session_id, event_callback)
    for name, handler in appointment_tools.handlers().items():
        llm.register_function(name, handler)

    context = LLMContext(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "[call_started]"},
        ],
        tools=get_tools_schema(),
    )
    context_pair = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    stop_secs=0.8,
                    start_secs=0.2,
                    confidence=0.7,
                    min_volume=0.4,
                )
            ),
            user_turn_stop_timeout=3.0,
            audio_idle_timeout=5.0,
        ),
    )

    user_transcript_relay = UserTranscriptRelay(event_callback)
    bot_transcript_relay = BotTranscriptRelay(event_callback)

    pipeline = Pipeline([
        transport.input(),
        stt,
        user_transcript_relay,
        context_pair.user(),
        llm,
        bot_transcript_relay,
        tts,
        transport.output(),
        context_pair.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            allow_interruptions=True,
        ),
        rtvi_observer_params=RTVIObserverParams(
            bot_llm_enabled=True,
            bot_tts_enabled=True,
            bot_output_enabled=True,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Client connected | session={session_id}")
        await task.queue_frames([LLMContextFrame(context=context)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected | session={session_id}")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)
    logger.info(f"Pipeline ended | session={session_id}")

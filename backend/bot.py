import os

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import LLMContextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from prompt import SYSTEM_PROMPT
from tools import AppointmentTools, get_tools_schema

load_dotenv()


async def run_bot(connection: SmallWebRTCConnection, session_id: str, event_callback):
    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    )

    stt = OpenAISTTService(
        api_key=os.getenv("OPENAI_API_KEY"),
        settings=OpenAISTTService.Settings(model="whisper-1"),
    )

    tts = OpenAITTSService(
        api_key=os.getenv("OPENAI_API_KEY"),
        settings=OpenAITTSService.Settings(voice="nova", model="tts-1"),
    )

    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        settings=AnthropicLLMService.Settings(model="claude-haiku-4-5-20251001"),
    )

    # Register tool handlers
    appointment_tools = AppointmentTools(session_id, event_callback)
    for name, handler in appointment_tools.handlers().items():
        llm.register_function(name, handler)

    # Build context with tools — pipecat 1.1.0 uses ToolsSchema directly
    context = LLMContext(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            # Seed a user turn so Claude generates an opening greeting immediately
            {"role": "user", "content": "[call_started]"},
        ],
        tools=get_tools_schema(),
    )
    context_pair = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    stop_secs=0.8,     # wait 800ms of silence before ending speech
                    start_secs=0.2,
                    confidence=0.7,
                    min_volume=0.4,    # lower threshold for quieter mics
                )
            ),
            user_turn_stop_timeout=3.0,   # wait 3s after VAD stops before finalising turn
            audio_idle_timeout=5.0,       # wait 5s of no audio frames before forcing stop
        ),
    )

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_pair.user(),
        llm,
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
        # Trigger Claude to generate the opening greeting
        await task.queue_frames([LLMContextFrame(context=context)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected | session={session_id}")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)
    logger.info(f"Pipeline ended | session={session_id}")

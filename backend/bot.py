import os

from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import (
    OpenAILLMContext,
    OpenAILLMContextFrame,
)
from pipecat.processors.frameworks.rtvi import RTVIObserverParams
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from prompt import SYSTEM_PROMPT
from tools import AppointmentTools, get_tool_schemas

load_dotenv()


async def run_bot(connection: SmallWebRTCConnection, session_id: str, event_callback):
    transport = SmallWebRTCTransport(
        connection=connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    stt = OpenAISTTService(
        api_key=os.getenv("OPENAI_API_KEY"),
        model="whisper-1",
    )

    tts = OpenAITTSService(
        api_key=os.getenv("OPENAI_API_KEY"),
        voice="nova",
        model="tts-1",
    )

    llm = AnthropicLLMService(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
        model="claude-haiku-4-5-20251001",
    )

    appointment_tools = AppointmentTools(session_id, event_callback)
    for name, handler in appointment_tools.handlers().items():
        llm.register_function(name, handler)

    context = OpenAILLMContext(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            # Trigger the bot to greet immediately when the call starts
            {"role": "user", "content": "[call_started]"},
        ],
        tools=get_tool_schemas(),
    )
    context_aggregator = llm.create_context_aggregator(context)

    pipeline = Pipeline([
        transport.input(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant(),
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
        # Queue the initial context so Claude generates the opening greeting
        await task.queue_frames([OpenAILLMContextFrame(context=context)])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected | session={session_id}")
        await task.cancel()

    runner = PipelineRunner()
    await runner.run(task)
    logger.info(f"Pipeline ended | session={session_id}")

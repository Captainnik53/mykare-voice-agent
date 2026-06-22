import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AgentEvent,
  BotState,
  CallEndedEvent,
  CallState,
  ToolEvent,
  TranscriptEvent,
  TranscriptMessage,
} from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useVoiceAgent() {
  const [callState, setCallState] = useState<CallState>('idle')
  const [botState, setBotState] = useState<BotState>('idle')
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  const [callSummary, setCallSummary] = useState<CallEndedEvent['data'] | null>(null)
  const [callerName, setCallerName] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const callStartRef = useRef<number | null>(null)

  // ------------------------------------------------------------------
  // WebSocket — events sidecar
  // ------------------------------------------------------------------
  const connectWS = useCallback((sid: string) => {
    const wsBase = API_BASE.replace(/^http/, 'ws') || `ws://localhost:8000`
    const ws = new WebSocket(`${wsBase}/ws/${sid}`)
    wsRef.current = ws

    const pingId = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 20_000)

    ws.onmessage = (msg) => {
      try {
        const event: AgentEvent = JSON.parse(msg.data)

        if (event.type === 'tool_called' || event.type === 'tool_result') {
          const te = event as ToolEvent
          setToolEvents(prev => [te, ...prev].slice(0, 10))
          // Extract caller name from identify_user result
          if (te.type === 'tool_result' && te.data.tool === 'identify_user' && te.data.name) {
            setCallerName(te.data.name as string)
          }
        } else if (event.type === 'user_transcript') {
          const te = event as TranscriptEvent
          if (te.data.text.trim()) {
            setTranscript(prev => [...prev, { role: 'user', text: te.data.text.trim(), ts: Date.now() }])
          }
        } else if (event.type === 'bot_transcript') {
          const te = event as TranscriptEvent
          if (te.data.text.trim()) {
            setTranscript(prev => [...prev, { role: 'agent', text: te.data.text.trim(), ts: Date.now() }])
          }
        } else if (event.type === 'call_ended') {
          setCallSummary((event as CallEndedEvent).data)
          setCallState('ended')
          setBotState('idle')
        }
      } catch { /* non-JSON keep-alive */ }
    }

    ws.onerror = () => console.warn('WS error — events may be missing')
    ws.onclose = () => { clearInterval(pingId); wsRef.current = null }
  }, [])

  // ------------------------------------------------------------------
  // RTVI data channel — bot speaking state
  // ------------------------------------------------------------------
  const handleDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string)
        if (msg.label !== 'rtvi-ai') return
        switch (msg.type) {
          case 'bot-tts-started':       setBotState('speaking');  break
          case 'bot-tts-stopped':       setBotState('listening'); break
          case 'bot-llm-started':       setBotState('thinking');  break
          case 'bot-llm-stopped':       setBotState('listening'); break
          case 'user-started-speaking': setBotState('listening'); break
        }
      } catch { /* ignore */ }
    }
  }, [])

  // ------------------------------------------------------------------
  // Start call
  // ------------------------------------------------------------------
  const startCall = useCallback(async () => {
    setError(null)
    setCallState('connecting')
    setToolEvents([])
    setTranscript([])
    setCallSummary(null)
    setCallerName(null)
    setCallDuration(null)

    const sid = crypto.randomUUID()
    setSessionId(sid)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      // Fetch ICE config from backend — includes TURN credentials for cloud NAT traversal
      const iceCfg = await fetch(`${API_BASE}/api/ice-servers`).then(r => r.json()).catch(() => ({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      }))

      const pc = new RTCPeerConnection(iceCfg)
      pcRef.current = pc

      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      pc.ontrack = (evt) => {
        if (!audioRef.current) {
          audioRef.current = document.createElement('audio')
          audioRef.current.autoplay = true
          document.body.appendChild(audioRef.current)
        }
        audioRef.current.srcObject = evt.streams[0]
      }

      pc.ondatachannel = (evt) => handleDataChannel(evt.channel)

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => { if (pc.iceGatheringState === 'complete') resolve() }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 4000)
      })

      const localDesc = pc.localDescription
      if (!localDesc) throw new Error('No local description after ICE gathering')

      const resp = await fetch(`${API_BASE}/api/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp: localDesc.sdp,
          type: localDesc.type,
          request_data: { session_id: sid },
        }),
      })

      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`Server error ${resp.status}: ${text}`)
      }

      const answer = await resp.json()
      const returnedSid: string = answer.session_id || sid
      setSessionId(returnedSid)

      await pc.setRemoteDescription({ sdp: answer.sdp, type: answer.type })

      connectWS(returnedSid)

      callStartRef.current = Date.now()
      setCallState('connected')
      setBotState('thinking')
    } catch (err: unknown) {
      console.error('startCall failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('Permission denied') || msg.includes('NotAllowedError')
        ? 'Microphone access denied. Please allow microphone and try again.'
        : `Could not start call: ${msg}`)
      setCallState('idle')
      pcRef.current?.close()
      pcRef.current = null
    }
  }, [connectWS, handleDataChannel])

  // ------------------------------------------------------------------
  // End call
  // ------------------------------------------------------------------
  const endCall = useCallback(() => {
    if (callStartRef.current) {
      setCallDuration(Math.round((Date.now() - callStartRef.current) / 1000))
      callStartRef.current = null
    }
    pcRef.current?.close()
    wsRef.current?.close()
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current.remove()
      audioRef.current = null
    }
    pcRef.current = null
    wsRef.current = null
    setBotState('idle')
    setCallState('ended')
  }, [])

  const reset = useCallback(() => {
    endCall()
    setError(null)
    setCallState('idle')
    setToolEvents([])
    setTranscript([])
    setCallSummary(null)
    setCallerName(null)
    setCallDuration(null)
  }, [endCall])

  useEffect(() => () => { endCall() }, [endCall])

  return {
    callState, botState, toolEvents, transcript, callSummary,
    callerName, callDuration, error, sessionId,
    startCall, endCall, reset,
  }
}

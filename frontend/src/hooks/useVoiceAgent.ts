import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentEvent, BotState, CallEndedEvent, CallState, ToolEvent } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useVoiceAgent() {
  const [callState, setCallState] = useState<CallState>('idle')
  const [botState, setBotState] = useState<BotState>('idle')
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [callSummary, setCallSummary] = useState<CallEndedEvent['data'] | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const connectionIdRef = useRef<string | null>(null)

  // ------------------------------------------------------------------
  // WebSocket — events sidecar
  // ------------------------------------------------------------------
  const connectWS = useCallback((sid: string) => {
    const wsUrl = `${API_BASE.replace(/^http/, 'ws')}/ws/${sid}`
    const ws = new WebSocket(wsUrl || `ws://localhost:8000/ws/${sid}`)
    wsRef.current = ws

    ws.onmessage = (msg) => {
      const event: AgentEvent = JSON.parse(msg.data)
      if (event.type === 'tool_called' || event.type === 'tool_result') {
        setToolEvents(prev => [event as ToolEvent, ...prev].slice(0, 10))
      } else if (event.type === 'call_ended') {
        setCallSummary((event as CallEndedEvent).data)
        setCallState('ended')
      }
    }

    ws.onclose = () => { wsRef.current = null }

    // keep-alive
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 25_000)
    ws.onclose = () => { clearInterval(ping); wsRef.current = null }
  }, [])

  // ------------------------------------------------------------------
  // RTVI data channel — bot state (speaking / listening)
  // ------------------------------------------------------------------
  const handleDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.label !== 'rtvi-ai') return
        switch (msg.type) {
          case 'bot-tts-started': setBotState('speaking'); break
          case 'bot-tts-stopped': setBotState('listening'); break
          case 'bot-llm-started': setBotState('thinking'); break
          case 'user-started-speaking': setBotState('listening'); break
        }
      } catch { /* ignore */ }
    }
  }, [])

  // ------------------------------------------------------------------
  // Start call
  // ------------------------------------------------------------------
  const startCall = useCallback(async () => {
    setCallState('connecting')
    setToolEvents([])
    setCallSummary(null)

    const sid = crypto.randomUUID()
    setSessionId(sid)

    // Get mic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    pcRef.current = pc

    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    // Remote audio → speaker
    pc.ontrack = (evt) => {
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.autoplay = true
      }
      audioRef.current.srcObject = evt.streams[0]
    }

    // RTVI data channel
    pc.ondatachannel = (evt) => handleDataChannel(evt.channel)

    // Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Wait for ICE gathering
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return }
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') resolve()
      }
      // Fallback timeout
      setTimeout(resolve, 3000)
    })

    const sdp = pc.localDescription!

    const res = await fetch(`${API_BASE}/api/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sdp: sdp.sdp,
        type: sdp.type,
        request_data: { session_id: sid },
      }),
    })

    const answer = await res.json()
    connectionIdRef.current = answer.id || null
    const returnedSid = answer.session_id || sid
    setSessionId(returnedSid)

    await pc.setRemoteDescription({ sdp: answer.sdp, type: answer.type })

    // Connect WS after we know the session_id
    connectWS(returnedSid)
    setCallState('connected')
    setBotState('thinking')
  }, [connectWS, handleDataChannel])

  // ------------------------------------------------------------------
  // End call
  // ------------------------------------------------------------------
  const endCall = useCallback(async () => {
    pcRef.current?.close()
    wsRef.current?.close()
    if (audioRef.current) { audioRef.current.srcObject = null }
    pcRef.current = null
    wsRef.current = null
    setBotState('idle')
    setCallState('ended')
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { endCall() }, [endCall])

  return { callState, botState, toolEvents, callSummary, sessionId, startCall, endCall }
}

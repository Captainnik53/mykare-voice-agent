import { useCallback, useEffect, useRef, useState } from 'react'
import { AgentEvent, BotState, CallEndedEvent, CallState, ToolEvent } from '../types'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function useVoiceAgent() {
  const [callState, setCallState] = useState<CallState>('idle')
  const [botState, setBotState] = useState<BotState>('idle')
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [callSummary, setCallSummary] = useState<CallEndedEvent['data'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
          setToolEvents(prev => [event as ToolEvent, ...prev].slice(0, 10))
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
          case 'bot-tts-started':   setBotState('speaking');  break
          case 'bot-tts-stopped':   setBotState('listening'); break
          case 'bot-llm-started':   setBotState('thinking');  break
          case 'bot-llm-stopped':   setBotState('listening'); break
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
    setCallSummary(null)

    const sid = crypto.randomUUID()
    setSessionId(sid)

    try {
      // 1. Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })

      // 2. Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      pcRef.current = pc

      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      // Remote audio → speaker
      pc.ontrack = (evt) => {
        if (!audioRef.current) {
          audioRef.current = document.createElement('audio')
          audioRef.current.autoplay = true
          document.body.appendChild(audioRef.current)
        }
        audioRef.current.srcObject = evt.streams[0]
      }

      // RTVI data channel from server
      pc.ondatachannel = (evt) => handleDataChannel(evt.channel)

      // 3. Create offer + set local description
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // 4. Wait for ICE gathering (vanilla ICE — include candidates in SDP)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => { if (pc.iceGatheringState === 'complete') resolve() }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 4000) // fallback
      })

      const localDesc = pc.localDescription
      if (!localDesc) throw new Error('No local description after ICE gathering')

      // 5. Send SDP offer to backend
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

      // 6. Set remote description from server answer
      await pc.setRemoteDescription({ sdp: answer.sdp, type: answer.type })

      // 7. Connect WebSocket for tool events
      connectWS(returnedSid)

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
    setCallSummary(null)
  }, [endCall])

  useEffect(() => () => { endCall() }, [endCall])

  return { callState, botState, toolEvents, callSummary, error, sessionId, startCall, endCall, reset }
}

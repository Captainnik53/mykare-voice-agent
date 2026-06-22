export type CallState = 'idle' | 'connecting' | 'connected' | 'ended'
export type BotState = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface TranscriptMessage {
  role: 'user' | 'agent'
  text: string
  ts: number
}

export interface ToolEvent {
  type: 'tool_called' | 'tool_result'
  data: {
    tool: string
    status: string
    name?: string
    phone?: string
    [key: string]: unknown
  }
  ts: string
}

export interface TranscriptEvent {
  type: 'user_transcript' | 'bot_transcript'
  data: { text: string }
  ts: string
}

export interface CallEndedEvent {
  type: 'call_ended'
  data: {
    summary: string
    phone: string
    name: string
    appointments: Appointment[]
    preferences: string
    timestamp: string
  }
  ts: string
}

export interface Appointment {
  id: number
  phone: string
  name: string
  date: string
  time_slot: string
  doctor: string
  status: string
  created_at: string
}

export type AgentEvent = ToolEvent | TranscriptEvent | CallEndedEvent

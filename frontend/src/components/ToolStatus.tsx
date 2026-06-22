import { ToolEvent } from '../types'

const TOOL_ICONS: Record<string, string> = {
  identify_user: '👤',
  fetch_slots: '📅',
  book_appointment: '✅',
  retrieve_appointments: '📋',
  cancel_appointment: '❌',
  modify_appointment: '✏️',
  end_conversation: '📝',
}

interface Props {
  events: ToolEvent[]
}

export function ToolStatus({ events }: Props) {
  if (events.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxHeight: 200,
      overflowY: 'auto',
    }}>
      {events.map((ev, i) => {
        const isResult = ev.type === 'tool_result'
        const icon = TOOL_ICONS[ev.data.tool] || '⚙️'
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 10,
              background: isResult ? '#f0fdf4' : '#eff6ff',
              border: `1px solid ${isResult ? '#bbf7d0' : '#bfdbfe'}`,
              fontSize: 13,
              fontWeight: 500,
              color: isResult ? '#166534' : '#1e40af',
              opacity: i === 0 ? 1 : 0.65,
              transition: 'opacity 0.3s',
            }}
          >
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span>{ev.data.status}</span>
          </div>
        )
      })}
    </div>
  )
}

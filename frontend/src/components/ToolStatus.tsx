import { useEffect, useState } from 'react'
import { ToolEvent } from '../types'

const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  identify_user:         { icon: '👤', label: 'Identifying User',        color: '#6366f1' },
  fetch_slots:           { icon: '📅', label: 'Fetching Slots',          color: '#0ea5e9' },
  book_appointment:      { icon: '✅', label: 'Booking Appointment',     color: '#10b981' },
  retrieve_appointments: { icon: '📋', label: 'Loading Appointments',    color: '#f59e0b' },
  cancel_appointment:    { icon: '🗑️', label: 'Cancelling Appointment',  color: '#ef4444' },
  modify_appointment:    { icon: '✏️', label: 'Rescheduling',            color: '#8b5cf6' },
  end_conversation:      { icon: '📝', label: 'Generating Summary',      color: '#64748b' },
}

interface Props {
  events: ToolEvent[]
}

interface DisplayEvent extends ToolEvent {
  key: number
  done: boolean
}

export function ToolStatus({ events }: Props) {
  const [displayed, setDisplayed] = useState<DisplayEvent[]>([])
  const nextKey = () => Date.now() + Math.random()

  useEffect(() => {
    if (events.length === 0) return
    const latest = events[0]

    setDisplayed(prev => {
      if (latest.type === 'tool_called') {
        // Add new active tool at the top
        return [{ ...latest, key: nextKey(), done: false }, ...prev].slice(0, 5)
      } else if (latest.type === 'tool_result') {
        // Mark matching pending tool as done and update its status
        const updated = prev.map(e =>
          !e.done && e.data.tool === latest.data.tool
            ? { ...e, data: latest.data, done: true }
            : e
        )
        // If no match, add as standalone completed
        if (updated.every(e => e.done || e.data.tool !== latest.data.tool)) {
          return [{ ...latest, key: nextKey(), done: true }, ...updated].slice(0, 5)
        }
        return updated
      }
      return prev
    })
  }, [events])

  // Auto-remove completed events after 4 seconds
  useEffect(() => {
    const ids = displayed.filter(e => e.done).map(e => e.key)
    if (ids.length === 0) return
    const t = setTimeout(() => {
      setDisplayed(prev => prev.filter(e => !ids.includes(e.key)))
    }, 4000)
    return () => clearTimeout(t)
  }, [displayed])

  if (displayed.length === 0) return null

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2,
      }}>
        Agent Actions
      </p>
      {displayed.map((ev) => {
        const meta = TOOL_META[ev.data.tool] || { icon: '⚙️', label: ev.data.tool, color: '#64748b' }
        const isDone = ev.done
        return (
          <div
            key={ev.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 12,
              background: isDone ? '#f8fafc' : `${meta.color}10`,
              border: `1.5px solid ${isDone ? '#e2e8f0' : meta.color}40`,
              transition: 'all 0.3s ease',
            }}
          >
            {/* Spinner or icon */}
            {!isDone ? (
              <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                <svg viewBox="0 0 28 28" width="28" height="28" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx="14" cy="14" r="11" fill="none" stroke={`${meta.color}20`} strokeWidth="2.5" />
                  <circle
                    cx="14" cy="14" r="11"
                    fill="none" stroke={meta.color} strokeWidth="2.5"
                    strokeDasharray="20 50"
                    strokeLinecap="round"
                    style={{ animation: 'spin 0.9s linear infinite', transformOrigin: '14px 14px' }}
                  />
                </svg>
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  {meta.icon}
                </span>
              </div>
            ) : (
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: '#f0fdf4', border: '1.5px solid #bbf7d0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>
                {ev.data.status.includes('❌') ? '❌' : '✅'}
              </div>
            )}

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: isDone ? '#64748b' : meta.color,
                marginBottom: 1,
              }}>
                {meta.label}
              </div>
              <div style={{
                fontSize: 12, color: '#64748b',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {ev.data.status}
              </div>
            </div>
          </div>
        )
      })}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

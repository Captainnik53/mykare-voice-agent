import { Appointment } from '../types'

interface SummaryData {
  summary: string
  phone: string
  name: string
  appointments: Appointment[]
  preferences: string
  timestamp: string
}

interface Props {
  data: SummaryData
  onClose: () => void
}

export function CallSummary({ data, onClose }: Props) {
  const time = new Date(data.timestamp).toLocaleString()

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 32,
        maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Call Summary</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{time}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: 8,
              padding: '8px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Close
          </button>
        </div>

        {/* Patient info */}
        <Section title="Patient">
          <Row label="Name" value={data.name || 'Unknown'} />
          <Row label="Phone" value={data.phone || 'Not provided'} />
        </Section>

        {/* Conversation summary */}
        <Section title="Summary">
          <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {data.summary}
          </p>
        </Section>

        {/* Appointments */}
        {data.appointments.length > 0 && (
          <Section title={`Appointments (${data.appointments.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.appointments.map(apt => (
                <div
                  key={apt.id}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: '#f0fdf4', border: '1px solid #bbf7d0',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#166534', fontSize: 14 }}>
                    {apt.date} at {apt.time_slot}
                  </div>
                  <div style={{ fontSize: 13, color: '#4b7c59', marginTop: 2 }}>
                    {apt.doctor} · {apt.name}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Preferences */}
        {data.preferences && (
          <Section title="Preferences & Notes">
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{data.preferences}</p>
          </Section>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 8, padding: '12px 0',
            background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Start New Call
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14, marginBottom: 4 }}>
      <span style={{ color: '#94a3b8', minWidth: 60 }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

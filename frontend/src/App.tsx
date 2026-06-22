import { Avatar } from './components/Avatar'
import { CallSummary } from './components/CallSummary'
import { ToolStatus } from './components/ToolStatus'
import { Transcript } from './components/Transcript'
import { useVoiceAgent } from './hooks/useVoiceAgent'

export default function App() {
  const {
    callState, botState, toolEvents, transcript,
    callSummary, callerName, callDuration,
    error, startCall, endCall, reset,
  } = useVoiceAgent()

  const isIdle       = callState === 'idle'
  const isConnecting = callState === 'connecting'
  const isConnected  = callState === 'connected'
  const isEnded      = callState === 'ended'

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #ede9fe 100%)',
    }}>
      <div style={{
        background: 'white',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🏥</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Mykare Health</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>AI Front-Desk Assistant</p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            width: '100%', padding: '12px 14px', borderRadius: 10,
            background: '#fef2f2', border: '1px solid #fecaca',
            color: '#dc2626', fontSize: 13, lineHeight: 1.5,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── IDLE ── */}
        {(isIdle || error) && (
          <>
            <Avatar botState="idle" />
            <div style={{ width: '100%', textAlign: 'center' }}>
              {!error && (
                <p style={{ fontSize: 14, color: '#64748b', marginBottom: 18 }}>
                  Book, modify, or cancel your appointments with Priya — our AI assistant.
                </p>
              )}
              <button
                type="button"
                onClick={error ? reset : startCall}
                style={{
                  width: '100%', padding: '14px 0',
                  background: '#3b82f6', color: 'white',
                  border: 'none', borderRadius: 14,
                  fontSize: 16, fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
                }}
              >
                {error ? '↩ Try Again' : '📞 Start Call'}
              </button>
            </div>
          </>
        )}

        {/* ── CONNECTING ── */}
        {isConnecting && (
          <>
            <Avatar botState="idle" />
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: 15 }}>
              <Spinner />
              <p style={{ marginTop: 10 }}>Connecting to Priya...</p>
            </div>
          </>
        )}

        {/* ── CONNECTED ── */}
        {isConnected && (
          <>
            <Avatar botState={botState} />

            {/* Transcript */}
            <Transcript messages={transcript} botState={botState} />

            {/* Tool actions */}
            <ToolStatus events={toolEvents} />

            <div style={{ width: '100%' }}>
              <button
                type="button"
                onClick={endCall}
                style={{
                  width: '100%', padding: '12px 0',
                  background: '#fef2f2', color: '#dc2626',
                  border: '1.5px solid #fecaca', borderRadius: 12,
                  fontSize: 15, fontWeight: 600, cursor: 'pointer',
                }}
              >
                End Call
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#cbd5e1' }}>Powered by Claude + Pipecat</p>
          </>
        )}

        {/* ── ENDED (no full summary — that's in the modal) ── */}
        {isEnded && !callSummary && (
          <>
            <Avatar botState="idle" />
            <EndCallCard
              callerName={callerName}
              callDuration={callDuration}
              transcriptCount={transcript.length}
            />
            <button
              type="button"
              onClick={reset}
              style={{
                width: '100%', padding: '14px 0',
                background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: 14,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
              }}
            >
              📞 Start New Call
            </button>
          </>
        )}
      </div>

      {/* Full summary modal (triggered by bot calling end_conversation) */}
      {callSummary && (
        <CallSummary data={callSummary} onClose={reset} />
      )}
    </div>
  )
}

// ── Helper components ────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, margin: '0 auto',
      border: '3px solid #e2e8f0',
      borderTopColor: '#3b82f6',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function EndCallCard({
  callerName,
  callDuration,
  transcriptCount,
}: {
  callerName: string | null
  callDuration: number | null
  transcriptCount: number
}) {
  return (
    <div style={{
      width: '100%',
      borderRadius: 16,
      border: '1.5px solid #e2e8f0',
      padding: '20px 20px',
      background: '#f8fafc',
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Call Summary
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row icon="🙍" label="Patient" value={callerName || 'Not identified'} />
        <Row icon="⏱️" label="Duration" value={callDuration !== null ? formatDuration(callDuration) : '—'} />
        <Row icon="💬" label="Messages" value={`${transcriptCount} exchange${transcriptCount !== 1 ? 's' : ''}`} />
      </div>
    </div>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13, color: '#64748b', minWidth: 70 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{value}</span>
    </div>
  )
}

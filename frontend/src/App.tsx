import { Avatar } from './components/Avatar'
import { CallSummary } from './components/CallSummary'
import { ToolStatus } from './components/ToolStatus'
import { useVoiceAgent } from './hooks/useVoiceAgent'

export default function App() {
  const { callState, botState, toolEvents, callSummary, error, startCall, endCall, reset } = useVoiceAgent()

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
        gap: 28,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🏥</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Mykare Health</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>AI Front-Desk Assistant</p>
        </div>

        {/* Avatar */}
        <Avatar botState={isConnected ? botState : 'idle'} />

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

        {/* Tool status panel */}
        {isConnected && toolEvents.length > 0 && (
          <div style={{ width: '100%' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Agent Actions
            </p>
            <ToolStatus events={toolEvents} />
          </div>
        )}

        {/* CTA / status */}
        {(isIdle || error) && (
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
        )}

        {isConnecting && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 15 }}>
            <Spinner />
            <p style={{ marginTop: 10 }}>Connecting to Priya...</p>
          </div>
        )}

        {isConnected && (
          <div style={{ width: '100%' }}>
            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 14 }}>
              Speak naturally — Priya is listening
            </p>
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
        )}

        {isEnded && !callSummary && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#64748b', marginBottom: 16 }}>Call ended.</p>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '12px 28px', background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Start New Call
            </button>
          </div>
        )}

        {isConnected && (
          <p style={{ fontSize: 11, color: '#cbd5e1' }}>Powered by Claude + Pipecat</p>
        )}
      </div>

      {callSummary && (
        <CallSummary data={callSummary} onClose={reset} />
      )}
    </div>
  )
}

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

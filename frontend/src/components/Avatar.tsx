import { BotState } from '../types'

interface Props {
  botState: BotState
}

export function Avatar({ botState }: Props) {
  const isSpeaking = botState === 'speaking'
  const isThinking = botState === 'thinking'
  const isListening = botState === 'listening'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Outer pulse ring */}
      <div style={{ position: 'relative', width: 180, height: 180 }}>
        {(isSpeaking || isListening) && (
          <>
            <div className={`pulse-ring ${isSpeaking ? 'pulse-fast' : 'pulse-slow'}`} />
            <div className={`pulse-ring ${isSpeaking ? 'pulse-fast' : 'pulse-slow'}`} style={{ animationDelay: '0.3s' }} />
          </>
        )}

        {/* Avatar face */}
        <svg
          width="180"
          height="180"
          viewBox="0 0 180 180"
          style={{ position: 'relative', zIndex: 1 }}
        >
          {/* Head */}
          <circle cx="90" cy="90" r="80" fill="#3b82f6" />
          <circle cx="90" cy="90" r="75" fill="#60a5fa" />

          {/* Hair */}
          <ellipse cx="90" cy="30" rx="45" ry="22" fill="#1e40af" />
          <rect x="45" y="30" width="90" height="12" fill="#1e40af" />

          {/* Face */}
          <circle cx="90" cy="95" r="52" fill="#fde68a" />

          {/* Eyes */}
          <ellipse
            cx="72"
            cy="83"
            rx="7"
            ry={isSpeaking ? '5' : '7'}
            fill="#1e293b"
            style={{ transition: 'ry 0.15s' }}
          />
          <ellipse
            cx="108"
            cy="83"
            rx="7"
            ry={isSpeaking ? '5' : '7'}
            fill="#1e293b"
            style={{ transition: 'ry 0.15s' }}
          />
          {/* Eye shine */}
          <circle cx="75" cy="80" r="2.5" fill="white" />
          <circle cx="111" cy="80" r="2.5" fill="white" />

          {/* Mouth — animates open/close when speaking */}
          {isSpeaking ? (
            <ellipse cx="90" cy="110" rx="18" ry={10} fill="#ef4444" />
          ) : (
            <path
              d="M 72 108 Q 90 118 108 108"
              stroke="#1e293b"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Thinking dots */}
          {isThinking && (
            <g>
              <circle cx="76" cy="138" r="5" fill="#1e293b" opacity="0.6">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" begin="0s" />
              </circle>
              <circle cx="90" cy="138" r="5" fill="#1e293b" opacity="0.6">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" begin="0.3s" />
              </circle>
              <circle cx="104" cy="138" r="5" fill="#1e293b" opacity="0.6">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="1s" repeatCount="indefinite" begin="0.6s" />
              </circle>
            </g>
          )}

          {/* Name tag */}
          <rect x="60" y="150" width="60" height="20" rx="10" fill="white" opacity="0.9" />
          <text x="90" y="164" textAnchor="middle" fill="#1e40af" fontSize="11" fontWeight="700" fontFamily="Inter, sans-serif">
            Priya
          </text>
        </svg>
      </div>

      {/* Status label */}
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: isSpeaking ? '#2563eb' : isThinking ? '#7c3aed' : isListening ? '#059669' : '#94a3b8',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        transition: 'color 0.3s',
      }}>
        {isSpeaking ? 'Speaking...' : isThinking ? 'Responding...' : isListening ? 'Listening' : 'Idle'}
      </div>

      <style>{`
        .pulse-ring {
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 3px solid #3b82f6;
          opacity: 0;
          animation: pulse 2s ease-out infinite;
        }
        .pulse-fast { animation-duration: 1.2s; border-color: #60a5fa; }
        .pulse-slow { animation-duration: 2.4s; }
        @keyframes pulse {
          0%   { transform: scale(0.85); opacity: 0.7; }
          100% { transform: scale(1.25); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

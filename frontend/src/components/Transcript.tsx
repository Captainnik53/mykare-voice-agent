import { useEffect, useRef } from 'react'
import { BotState, TranscriptMessage } from '../types'

interface Props {
  messages: TranscriptMessage[]
  botState: BotState
}

export function Transcript({ messages, botState }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, botState])

  const isActive = botState === 'thinking' || botState === 'speaking'

  if (messages.length === 0 && !isActive) return null

  return (
    <div style={{
      width: '100%',
      maxHeight: 260,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '4px 2px',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2,
        position: 'sticky', top: 0, background: 'transparent',
      }}>
        Conversation
      </p>

      {messages.map((msg) => (
        <div
          key={msg.ts}
          style={{
            display: 'flex',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-end',
            gap: 6,
          }}
        >
          {msg.role === 'agent' && (
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: '#3b82f6', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: 'white', fontWeight: 700,
            }}>P</div>
          )}
          <div style={{
            maxWidth: '78%',
            padding: '8px 12px',
            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: msg.role === 'user' ? '#3b82f6' : '#f1f5f9',
            color: msg.role === 'user' ? 'white' : '#1e293b',
            fontSize: 13,
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}>
            {msg.text}
          </div>
        </div>
      ))}

      {/* Live typing indicator when bot is thinking/speaking */}
      {isActive && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: '#3b82f6', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'white', fontWeight: 700,
          }}>P</div>
          <div style={{
            padding: '10px 14px',
            borderRadius: '16px 16px 16px 4px',
            background: '#f1f5f9',
            display: 'flex', gap: 4, alignItems: 'center',
          }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#94a3b8',
                animation: 'bounce 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

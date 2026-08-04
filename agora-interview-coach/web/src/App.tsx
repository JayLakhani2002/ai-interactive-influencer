import { useEffect, useRef, useState } from 'react'
import { CVIProvider } from './components/cvi/components/cvi-provider'
import { Conversation } from './components/cvi/components/conversation'

type Usage = { usedSeconds: number; remainingSeconds: number; sessions: unknown[] }
type Screen =
  | { name: 'start' }
  | { name: 'session'; conversationUrl: string; conversationId: string; maxSeconds: number }
  | { name: 'debrief'; usedSeconds: number }

function formatMinutes(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function StartScreen({ onStarted }: { onStarted: (screen: Screen) => void }) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [mode, setMode] = useState<'dev' | 'full'>('dev')
  const [targetRole, setTargetRole] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/usage')
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => setError('Could not reach the server. Is it running on :8787?'))
  }, [])

  const fullRehearsalsLeft = usage ? Math.floor(usage.remainingSeconds / 330) : null

  const handleStart = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, targetRole: targetRole || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start session')
      }
      onStarted({
        name: 'session',
        conversationUrl: data.conversation_url,
        conversationId: data.conversation_id,
        maxSeconds: mode === 'dev' ? 75 : 330,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Agora Interview Coach</h1>
      {usage && (
        <p>
          Used {formatMinutes(usage.usedSeconds)} / 25:00 — {fullRehearsalsLeft} full rehearsals left
        </p>
      )}
      <div style={{ margin: '1rem 0' }}>
        <label>
          <input type="radio" checked={mode === 'dev'} onChange={() => setMode('dev')} /> dev (75s)
        </label>
        <label style={{ marginLeft: '1rem' }}>
          <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /> full (5:30)
        </label>
      </div>
      <input
        type="text"
        placeholder="Target role (optional)"
        value={targetRole}
        onChange={(e) => setTargetRole(e.target.value)}
        style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
      />
      <button onClick={handleStart} disabled={loading}>
        {loading ? 'Starting…' : 'Start'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}

function SessionScreen({
  conversationUrl,
  conversationId,
  maxSeconds,
  onDone,
}: {
  conversationUrl: string
  conversationId: string
  maxSeconds: number
  onDone: (usedSeconds: number) => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds)
  const [startedAt] = useState(() => Date.now())
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, maxSeconds - Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [maxSeconds, startedAt])

  const finish = async () => {
    const usedSeconds = Math.floor((Date.now() - startedAt) / 1000)
    try {
      await fetch(`/api/sessions/${conversationId}/end`, { method: 'POST' })
    } finally {
      onDone(usedSeconds)
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen()
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        maxWidth: 960,
        margin: '2rem auto',
        fontFamily: 'sans-serif',
        background: document.fullscreenElement ? 'black' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p>Time remaining: {formatMinutes(secondsLeft)}</p>
        <button onClick={toggleFullscreen}>Fullscreen</button>
      </div>
      <Conversation conversationUrl={conversationUrl} onLeave={finish} />
      <button onClick={finish} style={{ marginTop: '1rem' }}>
        End session
      </button>
    </div>
  )
}

function DebriefScreen({ usedSeconds, onRestart }: { usedSeconds: number; onRestart: () => void }) {
  return (
    <div style={{ maxWidth: 480, margin: '4rem auto', fontFamily: 'sans-serif' }}>
      <h1>Debrief</h1>
      <p>Minutes used this session: {formatMinutes(usedSeconds)}</p>
      <ul>
        <li>What drill did she assign?</li>
        <li>What was the content fix?</li>
        <li>What did she say she saw?</li>
      </ul>
      <button onClick={onRestart}>Back to Start</button>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' })

  return (
    <CVIProvider>
      {screen.name === 'start' && <StartScreen onStarted={setScreen} />}
      {screen.name === 'session' && (
        <SessionScreen
          conversationUrl={screen.conversationUrl}
          conversationId={screen.conversationId}
          maxSeconds={screen.maxSeconds}
          onDone={(usedSeconds) => setScreen({ name: 'debrief', usedSeconds })}
        />
      )}
      {screen.name === 'debrief' && (
        <DebriefScreen usedSeconds={screen.usedSeconds} onRestart={() => setScreen({ name: 'start' })} />
      )}
    </CVIProvider>
  )
}

export default App

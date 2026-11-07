import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const SUGGESTIONS = [
  'What should I check for this fault?',
  'Why does the motor keep overheating?',
  'Vibration is rising - what do I inspect?',
  'Machine stopped sending data',
]

/** Renders **bold** and line breaks without injecting HTML. */
function RichText({ text }) {
  return text.split('\n').map((line, i) => (
    <p key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
      )}
    </p>
  ))
}

export default function Assistant({ machines, selectedId, aiEnabled }) {
  const [machineId, setMachineId] = useState(selectedId ?? '')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (selectedId) setMachineId(selectedId)
  }, [selectedId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, loading])

  const ask = async (q) => {
    const text = (q ?? question).trim()
    if (!text || loading) return
    setQuestion('')
    const machine = machines.find((m) => m.id === machineId)
    setMessages((m) => [...m, { role: 'user', text, machine: machine?.name }])
    setLoading(true)
    try {
      const res = await api.ask(text, machineId || null)
      setMessages((m) => [...m, { role: 'assistant', ...res, text: res.answer }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `Sorry, something went wrong: ${e.message}`, error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel assistant">
      <header className="panel-head">
        <div>
          <h2>Troubleshooting assistant</h2>
          <p className="muted">
            {aiEnabled ? 'Ask how to fix a problem. Answers use the machine manuals and live readings.' : 'Ask how to fix a problem. Shows the matching steps from the machine manuals.'}
          </p>
        </div>
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)} aria-label="Machine context">
          <option value="">No machine selected</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </header>

      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role} ${m.error ? 'msg-error' : ''}`}>
            {m.role === 'user' && m.machine && <span className="msg-context">{m.machine}</span>}
            <RichText text={m.text} />
            {m.sources?.length > 0 && (
              <div className="sources">
                <span className="muted small">Sources:</span>
                {m.sources.map((s, j) => (
                  <span key={j} className="source">
                    {s.source} › {s.heading}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="msg msg-assistant typing">Looking through the manuals…</div>}
        <div ref={endRef} />
      </div>

      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault()
          ask()
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Inserter threw E-042, what should I check?"
          maxLength={1000}
          aria-label="Question"
        />
        <button type="submit" className="btn-primary" disabled={loading || !question.trim()}>
          Ask
        </button>
      </form>
    </section>
  )
}

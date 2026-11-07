import { useState } from 'react'
import { api, usePolling } from '../api'
import { timeAgo } from '../format'

function minutes(m) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export default function FaultLogPanel({ refreshKey, onLogFault }) {
  const [days, setDays] = useState(30)
  const [confirmId, setConfirmId] = useState(null)
  const summaryQ = usePolling(() => api.faultLogSummary(days), 30000, [days, refreshKey])
  const listQ = usePolling(() => api.faultLog(days), 30000, [days, refreshKey])

  const summary = summaryQ.data
  const entries = listQ.data ?? []
  const maxMachine = Math.max(1, ...(summary?.byMachine ?? []).map((t) => t.minutesDown))

  const remove = async (id) => {
    await api.deleteLoggedFault(id)
    setConfirmId(null)
    summaryQ.refresh()
    listQ.refresh()
  }

  return (
    <section className="panel fault-log">
      <header className="panel-head">
        <div>
          <h2>Fault log</h2>
          <p className="muted">Faults logged by hand on any machine</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time window">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </header>

      {!summary || summary.count === 0 ? (
        <div className="empty small">
          <p>No faults logged yet.</p>
          <button className="btn-primary btn-inline" onClick={onLogFault}>
            + Log your first fault
          </button>
        </div>
      ) : (
        <>
          <div className="fl-totals">
            <div>
              <span className="kpi-label">Faults</span>
              <strong>{summary.count}</strong>
            </div>
            <div>
              <span className="kpi-label">Downtime</span>
              <strong>{minutes(summary.minutesDown)}</strong>
            </div>
          </div>

          <h3 className="subhead">Downtime by machine</h3>
          <ul className="fl-bars">
            {summary.byMachine.map((t) => (
              <li key={t.name}>
                <span className="fl-name">{t.name}</span>
                <span className="fl-track">
                  <span className="fl-fill" style={{ width: `${(100 * t.minutesDown) / maxMachine}%` }} />
                </span>
                <span className="fl-val">
                  {minutes(t.minutesDown)} · {t.count}×
                </span>
              </li>
            ))}
          </ul>

          <h3 className="subhead">Most common faults</h3>
          <ul className="fl-chips">
            {summary.byFault.map((t) => (
              <li key={t.name}>
                {t.name} <strong>{t.count}×</strong>
              </li>
            ))}
          </ul>

          <h3 className="subhead">Recent</h3>
          <ul className="fl-entries">
            {entries.slice(0, 15).map((e) => (
              <li key={e.id}>
                <div className="fl-entry-main">
                  <div>
                    <strong>{e.machineName}</strong> · {e.fault}
                    <span className="muted"> · {e.minutesDown} min down</span>
                  </div>
                  {e.description && <p>{e.description}</p>}
                  {e.fix && <p className="fl-fix">Fix: {e.fix}</p>}
                  <p className="muted small">
                    {new Date(e.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {timeAgo(e.occurredAt)}
                  </p>
                </div>
                {confirmId === e.id ? (
                  <span className="fl-confirm">
                    <button className="btn-small danger" onClick={() => remove(e.id)}>
                      Delete
                    </button>
                    <button className="btn-small" onClick={() => setConfirmId(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button className="icon-btn" onClick={() => setConfirmId(e.id)} aria-label={`Delete fault on ${e.machineName}`}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

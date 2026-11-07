import { useState } from 'react'
import { api } from '../api'
import { duration, timeAgo } from '../format'
import { alertDetail, alertTitle } from '../health'

export default function AlertsPanel({ alerts, machinesById, onChange }) {
  const [showHistory, setShowHistory] = useState(false)
  const list = alerts ?? []
  const open = list.filter((a) => !a.closedAt)
  const closed = list.filter((a) => a.closedAt)
  const shownClosed = showHistory ? closed.slice(0, 20) : closed.slice(0, 3)

  const ack = async (id) => {
    await api.ack(id)
    onChange()
  }

  const row = (a) => (
    <li key={a.id} className={`alert sev-${a.severity.toLowerCase()} ${a.closedAt ? 'closed' : ''}`}>
      <div className="alert-main">
        <strong className="alert-title">{alertTitle(a, machinesById[a.machineId]?.name)}</strong>
        <p>{alertDetail(a)}</p>
        <p className="muted small">
          {a.closedAt ? `Fixed after ${duration(a.openedAt, a.closedAt)} · ${timeAgo(a.closedAt)}` : `Started ${timeAgo(a.openedAt)}`}
        </p>
      </div>
      {!a.closedAt &&
        (a.acknowledgedAt ? (
          <span className="acked">Seen ✓</span>
        ) : (
          <button className="btn-small" onClick={() => ack(a.id)}>
            Mark as seen
          </button>
        ))}
    </li>
  )

  return (
    <section className="panel alerts">
      <header className="panel-head">
        <div>
          <h2>Alerts</h2>
          <p className="muted">Problems happening right now</p>
        </div>
        <span className={`badge ${open.length ? 'badge-red' : 'badge-green'}`}>{open.length ? `${open.length} active` : 'All clear'}</span>
      </header>
      {open.length === 0 ? <p className="empty small">Nothing needs attention right now.</p> : <ul className="alert-list">{open.map(row)}</ul>}

      {closed.length > 0 && (
        <>
          <h3 className="subhead">Recently fixed</h3>
          <ul className="alert-list">{shownClosed.map(row)}</ul>
          {closed.length > 3 && (
            <button className="link-btn" onClick={() => setShowHistory((s) => !s)}>
              {showHistory ? 'Show less' : `Show more (${Math.min(closed.length, 20) - 3})`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

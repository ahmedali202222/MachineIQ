import { api } from '../api'
import { ALERT_LABEL, duration, timeAgo } from '../format'

export default function AlertsPanel({ alerts, machinesById, onChange }) {
  const list = alerts ?? []
  const open = list.filter((a) => !a.closedAt)
  const closed = list.filter((a) => a.closedAt).slice(0, 12)

  const ack = async (id) => {
    await api.ack(id)
    onChange()
  }

  const row = (a) => (
    <li key={a.id} className={`alert sev-${a.severity.toLowerCase()} ${a.closedAt ? 'closed' : ''}`}>
      <div className="alert-main">
        <div className="alert-title">
          <span className="sev">{a.severity === 'CRITICAL' ? 'Critical' : 'Warning'}</span>
          <strong>{ALERT_LABEL[a.type] ?? a.type}</strong>
          <span className="muted">· {machinesById[a.machineId]?.name ?? a.machineId}</span>
        </div>
        <p>{a.message}</p>
        <p className="muted small">
          {a.closedAt ? `Resolved after ${duration(a.openedAt, a.closedAt)} · ` : `Open for ${duration(a.openedAt)} · `}
          {timeAgo(a.openedAt)}
        </p>
      </div>
      {!a.closedAt &&
        (a.acknowledgedAt ? (
          <span className="acked">Acknowledged</span>
        ) : (
          <button className="btn-small" onClick={() => ack(a.id)}>
            Acknowledge
          </button>
        ))}
    </li>
  )

  return (
    <section className="panel alerts">
      <header className="panel-head">
        <h2>Alerts</h2>
        <span className={`badge ${open.length ? 'badge-red' : ''}`}>{open.length} open</span>
      </header>
      {open.length === 0 && <p className="empty small">All clear. No open alerts.</p>}
      <ul className="alert-list">{open.map(row)}</ul>
      {closed.length > 0 && (
        <>
          <h3 className="subhead">Recently resolved</h3>
          <ul className="alert-list">{closed.map(row)}</ul>
        </>
      )}
    </section>
  )
}

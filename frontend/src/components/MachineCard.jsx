import { useState } from 'react'
import { api } from '../api'
import { num, STATUS_LABEL } from '../format'

const PROBLEMS = [
  ['jam', 'Product jam'],
  ['overheat', 'Overheating motor'],
  ['vibration', 'Worn bearing'],
  ['dropout', 'Sensor dropout'],
]

export default function MachineCard({ machine, selected, onSelect, demoEnabled, onInjected }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const r = machine.latest
  const tempOk = r?.tempQualityGood !== false

  const inject = async (problem) => {
    setBusy(true)
    setMenuOpen(false)
    try {
      await api.inject(machine.id, problem)
      onInjected?.()
    } catch (e) {
      alert(`Could not trigger problem: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`machine-card status-${machine.status.toLowerCase()} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(machine.id)}
      aria-pressed={selected}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(machine.id)}
    >
      <header className="machine-card-head">
        <div>
          <h3>{machine.name}</h3>
          <p className="muted">
            {machine.kind} · {machine.id}
          </p>
        </div>
        <span className={`pill pill-${machine.status.toLowerCase()}`}>
          <span className="dot" /> {STATUS_LABEL[machine.status] ?? machine.status}
        </span>
      </header>

      {machine.status === 'FAULTED' && (
        <div className="fault-banner">
          <strong>{r?.faultCode}</strong> {machine.faultDescription}
        </div>
      )}

      <dl className="metrics">
        <div>
          <dt>Motor temp</dt>
          <dd className={!tempOk ? 'bad' : r?.motorTempC >= 75 ? 'warn' : ''}>
            {tempOk ? `${num(r?.motorTempC)} °C` : 'Sensor fault'}
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{num(r?.speedPpm, 0)} /min</dd>
        </div>
        <div>
          <dt>Vibration</dt>
          <dd className={r?.vibrationMmS >= 7.1 ? 'warn' : ''}>{num(r?.vibrationMmS)} mm/s</dd>
        </div>
        <div>
          <dt>Pieces</dt>
          <dd>{r?.pieceCount?.toLocaleString() ?? '—'}</dd>
        </div>
      </dl>

      <footer className="machine-card-foot">
        <span className={machine.openAlerts ? 'alert-count' : 'muted'}>
          {machine.openAlerts ? `${machine.openAlerts} open alert${machine.openAlerts > 1 ? 's' : ''}` : 'No open alerts'}
        </span>
        {demoEnabled && (
          <div className="demo-menu" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost" onClick={() => setMenuOpen((o) => !o)} disabled={busy} aria-expanded={menuOpen}>
              {busy ? 'Sending…' : 'Simulate problem ▾'}
            </button>
            {menuOpen && (
              <ul className="menu" role="menu">
                {PROBLEMS.map(([key, label]) => (
                  <li key={key}>
                    <button role="menuitem" onClick={() => inject(key)}>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </footer>
    </article>
  )
}

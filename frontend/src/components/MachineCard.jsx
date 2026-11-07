import { useState } from 'react'
import { api } from '../api'
import { num } from '../format'
import { machineHealth, tempHint, vibrationHint } from '../health'

const PROBLEMS = [
  ['jam', 'Product jam'],
  ['overheat', 'Overheating motor'],
  ['vibration', 'Worn bearing'],
  ['dropout', 'Sensor dropout'],
]

function Metric({ label, value, hint }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value}
        {hint?.text && <span className={`hint hint-${hint.level}`}>{hint.text}</span>}
      </dd>
    </div>
  )
}

export default function MachineCard({ machine, selected, onSelect, demoEnabled, onInjected }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const r = machine.latest
  const health = machineHealth(machine)
  const tempOk = r?.tempQualityGood !== false

  const inject = async (problem) => {
    setBusy(true)
    setMenuOpen(false)
    setError(null)
    try {
      await api.inject(machine.id, problem)
      onInjected?.()
    } catch (e) {
      setError(`Couldn't trigger that: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`machine-card level-${health.level} ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(machine.id)}
      aria-pressed={selected}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(machine.id)}
    >
      <header className="machine-card-head">
        <div>
          <h3>{machine.name}</h3>
          <p className="muted">{machine.kind}</p>
        </div>
        {machine.openAlerts > 0 && <span className="alert-count">{machine.openAlerts} alert{machine.openAlerts > 1 ? 's' : ''}</span>}
      </header>

      <p className={`health health-${health.level}`}>
        <span className="dot" />
        {health.text}
      </p>

      {machine.status === 'FAULTED' && r?.faultCode && <p className="muted small fault-code">Fault code {r.faultCode} · see Ask for the fix</p>}

      <dl className="metrics">
        <Metric label="Motor temp" value={tempOk ? `${num(r?.motorTempC, 0)}°C` : '—'} hint={tempHint(r)} />
        <Metric label="Vibration" value={`${num(r?.vibrationMmS)} mm/s`} hint={vibrationHint(r)} />
        <Metric label="Speed" value={`${num(r?.speedPpm, 0)} / min`} />
        <Metric label="Made so far" value={r?.pieceCount?.toLocaleString() ?? '—'} />
      </dl>

      {error && <p className="form-error">{error}</p>}

      {demoEnabled && (
        <footer className="machine-card-foot" onClick={(e) => e.stopPropagation()}>
          <span className="muted small">Tap card for charts</span>
          <div className="demo-menu">
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
        </footer>
      )}
    </article>
  )
}

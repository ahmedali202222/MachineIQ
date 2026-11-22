import { useState } from 'react'
import { FLOOR_CONFIG } from './floorSim'
import { BREAKDOWN_GUIDE, JAM_GUIDE } from './machineGuide'
import './floor.css'

// Jam helper: the simplest possible tool for an operator at the machine.
// 1) pick the machine  2) pick the problem  3) see what to do. Optional: tap "Fixed" to count it.

const MACHINES = [
  { type: 'FlowMaster', note: 'Inserter for direct mail' },
  { type: 'Inserter', note: 'Pitney Bowes, fed by an inkjet' },
  { type: 'Inkjet', note: 'Prints the envelopes' },
]
const STORE = 'machineiq-helper'

// Browser storage can be missing or blocked; the helper still works without it.
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || { notes: {}, log: [] } } catch { return { notes: {}, log: [] } }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)) } catch { /* not saved; fine */ }
}
const today = () => new Date().toDateString()

export default function HelperView({ switcher }) {
  const [machine, setMachine] = useState(null)
  const [problem, setProblem] = useState(null)
  const [data, setData] = useState(load)
  const [flash, setFlash] = useState(null)

  const update = (fn) => setData((d) => { const next = fn(d); save(next); return next })
  const todays = data.log.filter((e) => e.day === today())
  const counts = Object.entries(todays.reduce((a, e) => { a[e.problem] = (a[e.problem] || 0) + 1; return a }, {}))
    .sort((a, b) => b[1] - a[1])
  const problems = machine ? [...FLOOR_CONFIG.faults[machine].map((f) => f.name), 'Something broke'] : []
  const noteKey = `${machine}|${problem}`
  const guide = problem && problem !== 'Something broke' ? JAM_GUIDE[problem] : null

  const home = () => { setMachine(null); setProblem(null); window.scrollTo({ top: 0 }) }
  const fixed = () => {
    update((d) => ({ ...d, log: [...d.log.slice(-500), { day: today(), machine, problem, at: Date.now() }] }))
    setFlash(`Logged: ${problem} on ${machine}`)
    setTimeout(() => setFlash(null), 2500)
    home()
  }

  return (
    <div className="app helper">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--panel-2)" />
            <path d="M6 21l5-9 5 6 4-7 6 10" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>Jam helper</h1>
            <p className="muted small">Pick the machine, pick the problem, fix it</p>
          </div>
        </div>
        {switcher}
      </header>

      <main className="helper-main">
        {flash && <p className="helper-flash" role="status">✓ {flash}</p>}

        {!machine && (
          <>
            <h2 className="helper-q">Which machine?</h2>
            <div className="helper-big">
              {MACHINES.map((m) => (
                <button key={m.type} onClick={() => setMachine(m.type)}>
                  <strong>{m.type}</strong>
                  <span>{m.note}</span>
                </button>
              ))}
            </div>
            {todays.length > 0 && (
              <section className="helper-today">
                <h3>Today you fixed {todays.length}</h3>
                <p className="muted">{counts.map(([p, n]) => `${p} ×${n}`).join(' · ')}</p>
              </section>
            )}
          </>
        )}

        {machine && !problem && (
          <>
            <button className="helper-back" onClick={home}>← Machines</button>
            <h2 className="helper-q">What's wrong with the {machine}?</h2>
            <div className="helper-big helper-list">
              {problems.map((p) => (
                <button key={p} className={p === 'Something broke' ? 'broke' : ''} onClick={() => { setProblem(p); window.scrollTo({ top: 0 }) }}>
                  <strong>{p}</strong>
                  {JAM_GUIDE[p] && <span>{JAM_GUIDE[p].where.split(':')[0]}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {machine && problem && (
          <>
            <button className="helper-back" onClick={() => setProblem(null)}>← {machine} problems</button>
            <h2 className="helper-q">{problem}</h2>

            {guide ? (
              <>
                <p className="muted">{guide.where}</p>
                <section className="helper-steps">
                  <h3>Do this</h3>
                  <ol>{guide.check.map((c) => <li key={c}>{c}</li>)}</ol>
                </section>
                {guide.tip && <p className="helper-tip">{guide.tip}</p>}
                <details className="helper-why">
                  <summary>Why it happens</summary>
                  <ul>{guide.why.map((w) => <li key={w}>{w}</li>)}</ul>
                </details>
              </>
            ) : (
              <section className="helper-steps helper-stop">
                <h3>Stop and call maintenance</h3>
                <ul>{Object.entries(BREAKDOWN_GUIDE).map(([k, v]) => <li key={k}><strong>{k}:</strong> {v}</li>)}</ul>
              </section>
            )}

            <label className="helper-notes">
              <span>Our floor's notes for this</span>
              <textarea
                rows={3}
                placeholder="e.g. On FM-05 the left guide slips, check it first"
                value={data.notes[noteKey] || ''}
                onChange={(e) => { const v = e.target.value; update((d) => ({ ...d, notes: { ...d.notes, [noteKey]: v } })) }}
              />
              <span className="muted small">Saved on this phone only.</span>
            </label>

            <button className="helper-done" onClick={fixed}>✓ Fixed it</button>
          </>
        )}
      </main>

      <footer className="footer muted small">General guide. Always follow your site's procedures and lockout rules.</footer>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { BREAKDOWN_GUIDE, JAM_GUIDE, MACHINES, PROBLEMS, REPEAT_AT } from './machineGuide'
import './helper.css'

// Jam helper: 1) pick the machine  2) pick the problem  3) do the fix, tap "Fixed it".
// The timer runs on its own from step 3 to "Fixed it". Everything is saved on this phone only.

const STORE = 'machineiq-helper'
const BROKE = 'Something broke'
const byId = Object.fromEntries(MACHINES.map((m) => [m.id, m]))

// Browser storage can be missing or blocked; the helper still works without it.
function load() {
  try { return { notes: {}, log: [], ...JSON.parse(localStorage.getItem(STORE)) } } catch { return { notes: {}, log: [] } }
}
function save(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)) } catch { /* not saved; fine */ }
}
const today = () => new Date().toDateString()
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const mins = (s) => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`)

export default function HelperView() {
  const [machineId, setMachineId] = useState(null)
  const [problem, setProblem] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [data, setData] = useState(load)
  const [flash, setFlash] = useState(null)

  // Tick once a second while a fix is open.
  useEffect(() => {
    if (!startedAt) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const update = (fn) => setData((d) => { const next = fn(d); save(next); return next })
  const day = new Date(now).toDateString()
  const todays = data.log.filter((e) => e.day === day)
  const countToday = (m, p) => todays.filter((e) => e.machine === m && e.problem === p).length
  const machineToday = (m) => todays.filter((e) => e.machine === m).length

  // Same jam on the same machine REPEAT_AT+ times today.
  const repeats = Object.values(todays.reduce((a, e) => {
    const k = `${e.machine}|${e.problem}`
    a[k] = a[k] || { machine: e.machine, problem: e.problem, n: 0 }
    a[k].n++
    return a
  }, {})).filter((r) => r.n >= REPEAT_AT && r.problem !== BROKE).sort((a, b) => b.n - a.n)

  const machine = machineId ? byId[machineId] : null
  const guide = problem && problem !== BROKE ? JAM_GUIDE[problem] : null
  const before = machineId && problem ? countToday(machineId, problem) : 0
  const isRepeat = before + 1 >= REPEAT_AT
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  const noteKey = `${machine?.type}|${problem}`
  const downSecs = todays.reduce((s, e) => s + (e.secs || 0), 0)
  const longest = todays.reduce((a, e) => (!a || (e.secs || 0) > a.secs ? e : a), null)

  const top = () => window.scrollTo({ top: 0 })
  const home = () => { setMachineId(null); setProblem(null); setStartedAt(null); setNow(Date.now()); top() }
  // The start time comes from the click event (ms since the epoch).
  const openFix = (m, p, e) => { const t = Math.round(performance.timeOrigin + e.timeStamp); setMachineId(m); setProblem(p); setStartedAt(t); setNow(t); top() }
  const fixed = () => {
    const secs = elapsed
    update((d) => ({ ...d, log: [...d.log.slice(-1000), { day: today(), machine: machineId, type: machine.type, problem, secs, at: Date.now() }] }))
    setFlash(`${machineId} · ${problem} fixed in ${mmss(secs)}`)
    setTimeout(() => setFlash(null), 3000)
    home()
  }

  const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
  const tile = (m) => {
    const n = machineToday(m.id)
    return (
      <button key={m.id} className="mbtn" onClick={() => { setMachineId(m.id); top() }}>
        <strong>{m.id}</strong>
        {m.note && <span>{m.note}</span>}
        {n > 0 && <em className="badge-n">{n} today</em>}
      </button>
    )
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
            <h1>MachineIQ · Jam helper</h1>
            <p className="muted small">Pick the machine, pick the problem, fix it</p>
          </div>
        </div>
      </header>

      <main className="helper-main">
        {flash && <p className="helper-flash" role="status">✓ {flash}</p>}

        {/* 1. Which machine */}
        {!machine && (
          <>
            {repeats.length > 0 && (
              <section className="helper-alert">
                <h3>Keeps coming back today</h3>
                {repeats.map((r) => (
                  <button key={`${r.machine}${r.problem}`} onClick={(e) => openFix(r.machine, r.problem, e)}>
                    <strong>{r.machine}</strong> · {r.problem} <span>×{r.n}</span>
                  </button>
                ))}
                <p className="small">Tap to see the real causes to check.</p>
              </section>
            )}

            <h2 className="helper-q">Which machine?</h2>
            <h3 className="helper-sub">FlowMasters</h3>
            <div className="mgrid">{MACHINES.filter((m) => m.type === 'FlowMaster').map(tile)}</div>
            <h3 className="helper-sub">Inserter lines: inkjet → FlowMaster</h3>
            <div className="mgrid mgrid-lines">{MACHINES.filter((m) => m.type !== 'FlowMaster').map(tile)}</div>

            {todays.length > 0 && (
              <section className="helper-today">
                <h3>Today: {todays.length} fixed · {mins(downSecs)} down</h3>
                {longest?.secs > 0 && <p className="muted">Longest: {longest.machine} {longest.problem}, {mmss(longest.secs)}</p>}
              </section>
            )}
          </>
        )}

        {/* 2. What's wrong */}
        {machine && !problem && (
          <>
            <button className="helper-back" onClick={home}>← Machines</button>
            <h2 className="helper-q">What's wrong with {machine.id}?</h2>
            <div className="helper-big helper-list">
              {[...PROBLEMS[machine.type], BROKE].map((p) => {
                const n = countToday(machine.id, p)
                return (
                  <button key={p} className={`${p === BROKE ? 'broke' : ''} ${n + 1 >= REPEAT_AT && p !== BROKE ? 'hot' : ''}`} onClick={(e) => openFix(machine.id, p, e)}>
                    <strong>{p}</strong>
                    {n > 0 && <em className="badge-n">{n}× today</em>}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* 3. The fix */}
        {machine && problem && (
          <>
            <button className="helper-back" onClick={() => { setProblem(null); setStartedAt(null); top() }}>← {machine.id} problems</button>
            <div className="fixhead">
              <h2 className="helper-q">{machine.id} · {problem}</h2>
              <div className="timer" aria-label="Time down">
                <span className="small">Down</span>
                <strong>{mmss(elapsed)}</strong>
              </div>
            </div>
            {guide && <p className="muted">{guide.where}{guide.usual ? ` ${guide.usual}.` : ''}</p>}

            {guide && isRepeat && (
              <section className="helper-steps helper-repeat">
                <h3>{ordinal(before + 1)} time today on {machine.id}. The quick fix isn't holding.</h3>
                <p className="small">Check the real cause:</p>
                <ol>{guide.repeat.map((r) => <li key={r.cause}><strong>{r.cause}</strong><span>{r.fix}</span></li>)}</ol>
              </section>
            )}

            {guide && (
              <details className="helper-steps" open={!isRepeat}>
                <summary><h3>Quick fix</h3></summary>
                <ol>{guide.quick.map((c) => <li key={c}>{c}</li>)}</ol>
              </details>
            )}

            {guide && !isRepeat && (
              <details className="helper-why">
                <summary>Keeps coming back? Check the real cause</summary>
                <ol>{guide.repeat.map((r) => <li key={r.cause}><strong>{r.cause}</strong><span>{r.fix}</span></li>)}</ol>
              </details>
            )}

            {!guide && (
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

            <button className="helper-done" onClick={fixed}>✓ Fixed it · {mmss(elapsed)}</button>
          </>
        )}
      </main>

      <footer className="footer muted small">A reminder tool, not a manual. Always follow your site's procedures and lockout rules.</footer>
    </div>
  )
}

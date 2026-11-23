import { useEffect, useState } from 'react'
import HistoryView, { Timeline } from './HistoryView'
import { sampleLog, summarize } from './history'
import { BREAKDOWN_GUIDE, JAM_GUIDE, MACHINES, PROBLEMS, REPEAT_AT, SHIFTS } from './machineGuide'
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

/** 6 months of every machine, week by week, ending today: example history or the real log. */
// Cached: it only changes when the day, the data source, or the log changes.
let snapCache = null
function buildSnapshot(dayKey, exampleOn, realLog) {
  if (snapCache && snapCache.dayKey === dayKey && snapCache.exampleOn === exampleOn && snapCache.realLog === realLog) return snapCache.value
  const value = computeSnapshot(dayKey, exampleOn, realLog)
  snapCache = { dayKey, exampleOn, realLog, value }
  return value
}
function computeSnapshot(dayKey, exampleOn, realLog) {
  const end = new Date(dayKey)
  end.setHours(23, 59, 59, 999)
  return summarize(exampleOn ? sampleLog(end) : realLog, 182, end.getTime())
}

/** A step the operator can tap to say "this is what fixed it". */
function Pick({ value, picked, onPick, children }) {
  const on = picked === value
  return (
    <li className={`pick ${on ? 'on' : ''}`}>
      <button onClick={() => onPick(on ? null : value)} aria-pressed={on}>{children}{on && <em>✓ fixed it</em>}</button>
    </li>
  )
}

export default function HelperView() {
  const [machineId, setMachineId] = useState(null)
  const [problem, setProblem] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [clock, setClock] = useState(() => Date.now())
  const [data, setData] = useState(load)
  const [flash, setFlash] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [fixUsed, setFixUsed] = useState(null)

  // Tick once a second while a fix is open.
  // The clock on the home screen.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 10000)
    return () => clearInterval(t)
  }, [])

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

  // Home dashboard: clock, shift, and a 6-month snapshot of every machine.
  const clockDate = new Date(clock)
  const hourNow = clockDate.getHours() + clockDate.getMinutes() / 60
  const shiftNow = SHIFTS.find((sh) => hourNow >= sh.start && hourNow < sh.end)
  const shiftLeft = shiftNow ? Math.round((shiftNow.end - hourNow) * 60) : null
  const exampleOn = data.sampleOn ?? data.log.length === 0
  const dayKey = clockDate.toDateString()
  const realLog = data.log
  const snapshot = buildSnapshot(dayKey, exampleOn, realLog)
  const fmtClock = clockDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const fmtDay = clockDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  const top = () => window.scrollTo({ top: 0 })
  const home = () => { setMachineId(null); setProblem(null); setStartedAt(null); setShowHistory(false); setNow(Date.now()); top() }
  const openHistory = () => { setNow(Date.now()); setShowHistory(true); top() }
  // The start time comes from the click event (ms since the epoch).
  const openFix = (m, p, e) => { const t = Math.round(performance.timeOrigin + e.timeStamp); setMachineId(m); setProblem(p); setFixUsed(null); setStartedAt(t); setNow(t); top() }
  const fixed = () => {
    const secs = elapsed
    update((d) => ({ ...d, log: [...d.log.slice(-5000), { day: today(), machine: machineId, type: machine.type, problem, secs, fix: fixUsed, at: Date.now() }] }))
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

        {showHistory && (
          <HistoryView
            realLog={data.log}
            sampleOn={data.sampleOn ?? data.log.length === 0}
            setSampleOn={(on) => update((d) => ({ ...d, sampleOn: on }))}
            onBack={home}
            now={now}
          />
        )}

        {/* 1. Which machine */}
        {!machine && !showHistory && (
          <>
            <section className="dash-hero">
              <div>
                <p className="dash-time">{fmtClock}</p>
                <p className="dash-day">{fmtDay}</p>
              </div>
              <div className={`dash-shift ${shiftNow ? 'on' : ''}`}>
                <strong>{shiftNow ? shiftNow.name : 'Off shift'}</strong>
                <span>{shiftNow ? `${shiftLeft >= 60 ? `${Math.floor(shiftLeft / 60)}h ` : ''}${shiftLeft % 60}m left` : `Next: ${SHIFTS[0].name} at ${SHIFTS[0].start}:00`}</span>
              </div>
            </section>

            <section className="dash-today">
              <div><span>Fixed today</span><strong>{todays.length}</strong></div>
              <div><span>Time down</span><strong>{downSecs ? mins(downSecs) : '0 min'}</strong></div>
              <div><span>Longest</span><strong>{longest?.secs ? mmss(longest.secs) : '—'}</strong>{longest?.secs > 0 && <em>{longest.machine}</em>}</div>
            </section>

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

            {snapshot.total > 0 && snapshot.weeks.length > 1 && (
              <section className="dash-tl">
                <header>
                  <div>
                    <h3>Last 6 months · every machine</h3>
                    <p className="muted small">{exampleOn ? 'Example history' : 'Your logged fixes'} · darker = more jams</p>
                  </div>
                  <button className="hlink" onClick={openHistory}>Open History →</button>
                </header>
                <Timeline timeline={snapshot.timeline} weeks={snapshot.weeks} onPick={openHistory} compact />
                <p className="muted small dash-tl-axis"><span>{snapshot.weeks[0].label}</span><span>Today</span></p>
              </section>
            )}

            <h2 className="helper-q">Which machine?</h2>
            <h3 className="helper-sub">FlowMasters</h3>
            <div className="mgrid">{MACHINES.filter((m) => m.type === 'FlowMaster').map(tile)}</div>
            <h3 className="helper-sub">Inserter lines: inkjet → FlowMaster</h3>
            <div className="mgrid mgrid-lines">{MACHINES.filter((m) => m.type !== 'FlowMaster').map(tile)}</div>


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
                <ol>{guide.repeat.map((r) => <Pick key={r.cause} value={r.fix} picked={fixUsed} onPick={setFixUsed}><strong>{r.cause}</strong><span>{r.fix}</span></Pick>)}</ol>
              </section>
            )}

            {guide && (
              <details className="helper-steps" open={!isRepeat}>
                <summary><h3>Quick fix</h3></summary>
                <ol>{guide.quick.map((c) => <Pick key={c} value={c} picked={fixUsed} onPick={setFixUsed}>{c}</Pick>)}</ol>
              </details>
            )}

            {guide && !isRepeat && (
              <details className="helper-why">
                <summary>Keeps coming back? Check the real cause</summary>
                <ol>{guide.repeat.map((r) => <Pick key={r.cause} value={r.fix} picked={fixUsed} onPick={setFixUsed}><strong>{r.cause}</strong><span>{r.fix}</span></Pick>)}</ol>
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

            {guide && <p className="muted small pick-hint">{fixUsed ? `What fixed it: ${fixUsed}` : 'Tap the step that fixed it (optional)'}</p>}
            <button className="helper-done" onClick={fixed}>✓ Fixed it · {mmss(elapsed)}</button>
          </>
        )}
      </main>

      <footer className="footer muted small">A reminder tool, not a manual. Always follow your site's procedures and lockout rules.</footer>
    </div>
  )
}

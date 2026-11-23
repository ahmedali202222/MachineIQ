import { useMemo, useState } from 'react'
import { JAM_GUIDE } from './machineGuide'
import { sampleLog, summarize } from './history'

const RANGES = [[7, 'Week'], [30, 'Month'], [182, '6 months']]
const hours = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`)
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const PAGE = 40

function Bars({ items, onPick, value = (i) => i.secs, label = (i) => `${hours(i.secs)} · ${i.n}×` }) {
  const max = Math.max(1, ...items.map(value))
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.name}>
          <button disabled={!onPick} onClick={() => onPick?.(i.name)}>
            <span className="hb-name">{i.name}</span>
            <span className="hb-track"><span style={{ width: `${(value(i) / max) * 100}%` }} /></span>
            <span className="hb-val">{label(i)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** One row per machine, one square per week; darker = more jams. Tap a row to open that machine. */
function Timeline({ timeline, weeks, onPick }) {
  // Scale from the quietest week to the busiest, so bad weeks stand out.
  const all = timeline.flatMap((t) => t.weeks)
  const max = Math.max(1, ...all)
  const min = Math.min(...all.filter((n) => n > 0), max)
  const shade = (n) => (n ? 0.1 + 0.9 * ((n - min) / Math.max(1, max - min)) ** 1.5 : 0)
  return (
    <div className="htl">
      {timeline.map((t) => (
        <button key={t.machine} className="htl-row" onClick={() => onPick(t.machine)}>
          <span className="htl-name">{t.machine}</span>
          <span className="htl-cells">
            {t.weeks.map((n, i) => (
              <span key={i} title={`${t.machine}, week of ${weeks[i].label}: ${n} jams`}
                style={{ '--a': shade(n) }} />
            ))}
          </span>
          <span className="htl-sum">{t.weeks.reduce((a, b) => a + b, 0)}</span>
        </button>
      ))}
      <p className="muted small htl-axis"><span>{weeks[0].label}</span><span>darker = more jams</span><span>{weeks[weeks.length - 1].label}</span></p>
    </div>
  )
}

/** Every jam on one machine, newest first: when, what, how long, what fixed it. */
function JamLog({ rows }) {
  const [filter, setFilter] = useState(null)
  const [shown, setShown] = useState(PAGE)
  const problems = [...new Set(rows.map((e) => e.problem))]
  const list = rows.filter((e) => !filter || e.problem === filter).slice().reverse()
  const dayOf = (e) => new Date(e.at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <>
      <div className="hchips">
        <button className={!filter ? 'active' : ''} onClick={() => { setFilter(null); setShown(PAGE) }}>All</button>
        {problems.map((p) => <button key={p} className={filter === p ? 'active' : ''} onClick={() => { setFilter(p); setShown(PAGE) }}>{p}</button>)}
      </div>
      <ul className="hlog">
        {list.slice(0, shown).map((e, i, arr) => {
          const d = new Date(e.at)
          const dayLabel = dayOf(e)
          const head = i === 0 || dayOf(arr[i - 1]) !== dayLabel
          return (
            <li key={e.at + e.problem}>
              {head && <h4>{dayLabel}</h4>}
              <div className="hlog-row">
                <span className="hlog-time muted">{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="hlog-main">
                  <strong>{e.problem}</strong> <span className="muted">· {mmss(e.secs || 0)}</span>
                  <span className="hlog-fix">{e.fix ? `Fixed: ${e.fix}` : 'Fix not recorded'}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {list.length > shown && <button className="hbtn hbtn-wide" onClick={() => setShown((n) => n + PAGE)}>Show older ({list.length - shown} more)</button>}
    </>
  )
}

export default function HistoryView({ realLog, sampleOn, setSampleOn, onBack, now }) {
  const [days, setDays] = useState(182)
  const [machine, setMachine] = useState(null)
  const sample = useMemo(() => (sampleOn ? sampleLog(new Date(now)) : []), [sampleOn, now])
  const log = sampleOn ? sample : realLog
  const all = useMemo(() => summarize(log, days, now), [log, days, now])
  const one = useMemo(() => (machine ? summarize(log.filter((e) => e.machine === machine), days, now) : null), [log, machine, days, now])
  const s = one || all
  const topFix = s.byProblem[0] && JAM_GUIDE[s.byProblem[0].name]
  const pick = (m) => { setMachine(m); window.scrollTo({ top: 0 }) }

  return (
    <>
      <button className="helper-back" onClick={machine ? () => setMachine(null) : onBack}>← {machine ? 'All machines' : 'Machines'}</button>
      <h2 className="helper-q">{machine ? `${machine} history` : 'History'}</h2>

      {sampleOn ? (
        <p className="hsample">Sample data: made up to show how History works. Not your floor's real numbers. <button onClick={() => setSampleOn(false)}>Turn off</button></p>
      ) : realLog.length === 0 ? (
        <section className="helper-today">
          <h3>No history yet</h3>
          <p className="muted">Every time you tap "Fixed it", it shows up here. Want to see how it will look?</p>
          <button className="hbtn" onClick={() => setSampleOn(true)}>Load 6 months of sample data</button>
        </section>
      ) : (
        <p className="muted small">Your real fixes, saved on this phone. <button className="hlink" onClick={() => setSampleOn(true)}>Show sample data instead</button></p>
      )}

      {log.length > 0 && (
        <>
          <div className="segmented hrange" role="group" aria-label="Time range">
            {RANGES.map(([d, l]) => <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{l}</button>)}
          </div>

          <div className="htotals">
            <div><span className="muted small">Jams fixed</span><strong>{s.total.toLocaleString()}</strong></div>
            <div><span className="muted small">Time down</span><strong>{hours(s.secs)}</strong></div>
          </div>

          {!machine && s.weeks.length > 1 && (
            <>
              <h3 className="helper-sub">Timeline · every machine, week by week · tap one</h3>
              <Timeline timeline={all.timeline} weeks={all.weeks} onPick={pick} />
            </>
          )}

          {s.byProblem[0] && (
            <section className="helper-steps">
              <h3>Biggest time-waster: {s.byProblem[0].name}</h3>
              <p className="muted">{hours(s.byProblem[0].secs)} over {s.byProblem[0].n} jams.</p>
              {topFix && <p className="hfix">Real cause to check first: <strong>{topFix.repeat[0].cause.replace(' (most common)', '')}</strong>. {topFix.repeat[0].fix}.</p>}
            </section>
          )}

          {machine && s.weeks.length > 1 && (
            <>
              <h3 className="helper-sub">Jams per week</h3>
              <div className="hweeks">
                {s.weeks.map((w) => {
                  const max = Math.max(1, ...s.weeks.map((x) => x.n))
                  return <div key={w.label} title={`${w.label}: ${w.n} jams`}><span className="hw-bar" style={{ height: `${(w.n / max) * 100}%` }} /></div>
                })}
              </div>
              <p className="muted small hweeks-axis"><span>{s.weeks[0].label}</span><span>{s.weeks[s.weeks.length - 1].label}</span></p>
            </>
          )}

          <h3 className="helper-sub">Time lost by problem</h3>
          <Bars items={s.byProblem} />

          {!machine && (
            <>
              <h3 className="helper-sub">Time lost by machine · tap one</h3>
              <Bars items={all.byMachine} onPick={pick} />
            </>
          )}

          {s.repeats.length > 0 && (
            <>
              <h3 className="helper-sub">Kept coming back (3+ times in a day)</h3>
              <Bars items={s.repeats.slice(0, 6)} value={(i) => i.n} label={(i) => `${i.n} days`} />
            </>
          )}

          {machine && (
            <>
              <h3 className="helper-sub">Every jam and what fixed it</h3>
              <JamLog key={`${machine}-${days}-${sampleOn}`} rows={s.rows} />
            </>
          )}
        </>
      )}
    </>
  )
}

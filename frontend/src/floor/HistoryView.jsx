import { useMemo, useState } from 'react'
import { JAM_GUIDE } from './machineGuide'
import { sampleLog, summarize } from './history'

const RANGES = [[7, 'Week'], [30, 'Month'], [150, '5 months']]
const hours = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`)

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

export default function HistoryView({ realLog, sampleOn, setSampleOn, onBack, now }) {
  const [days, setDays] = useState(30)
  const [machine, setMachine] = useState(null)
  const sample = useMemo(() => (sampleOn ? sampleLog(new Date(now)) : []), [sampleOn, now])
  const log = sampleOn ? sample : realLog
  const all = useMemo(() => summarize(log, days, now), [log, days, now])
  const one = useMemo(() => (machine ? summarize(log.filter((e) => e.machine === machine), days, now) : null), [log, machine, days, now])
  const s = one || all
  const topFix = s.byProblem[0] && JAM_GUIDE[s.byProblem[0].name]

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
          <button className="hbtn" onClick={() => setSampleOn(true)}>Load 5 months of sample data</button>
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

          {s.byProblem[0] && (
            <section className="helper-steps">
              <h3>Biggest time-waster: {s.byProblem[0].name}</h3>
              <p className="muted">{hours(s.byProblem[0].secs)} over {s.byProblem[0].n} jams.</p>
              {topFix && <p className="hfix">Real cause to check first: <strong>{topFix.repeat[0].cause.replace(' (most common)', '')}</strong>. {topFix.repeat[0].fix}.</p>}
            </section>
          )}

          <h3 className="helper-sub">Time lost by problem</h3>
          <Bars items={s.byProblem} />

          {!machine && (
            <>
              <h3 className="helper-sub">Time lost by machine · tap one</h3>
              <Bars items={all.byMachine} onPick={setMachine} />
            </>
          )}

          {s.repeats.length > 0 && (
            <>
              <h3 className="helper-sub">Kept coming back (3+ times in a day)</h3>
              <Bars items={s.repeats.slice(0, 6)} value={(i) => i.n} label={(i) => `${i.n} days`} />
            </>
          )}

          {s.weeks.length > 1 && (
            <>
              <h3 className="helper-sub">Jams per week</h3>
              <div className="hweeks">
                {s.weeks.map((w) => {
                  const max = Math.max(1, ...s.weeks.map((x) => x.n))
                  return (
                    <div key={w.label} title={`${w.label}: ${w.n} jams`}>
                      <span className="hw-bar" style={{ height: `${(w.n / max) * 100}%` }} />
                    </div>
                  )
                })}
              </div>
              <p className="muted small hweeks-axis"><span>{s.weeks[0].label}</span><span>{s.weeks[s.weeks.length - 1].label}</span></p>
            </>
          )}
        </>
      )}
    </>
  )
}

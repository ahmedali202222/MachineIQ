import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FloorSim, fmtDate, fmtTime } from './floorSim'
import './floor.css'

const STATUS = {
  RUNNING: { text: 'Running', level: 'ok' },
  JAM: { text: 'Jam', level: 'stop' },
  WAITING: { text: 'Waiting', level: 'warn' },
  CHANGEOVER: { text: 'Changeover', level: 'info' },
  BREAKDOWN: { text: 'Breakdown', level: 'stop' },
  STARVED: { text: 'Held', level: 'held' },
  OFF: { text: 'Off', level: 'off' },
}
const SPEEDS = [['Pause', 0], ['Real time', 1 / 60], ['60×', 1], ['600×', 10]]
const RANGES = [['shift', 'This shift'], ['today', 'Today'], ['week', '5 days']]
const TABS = [
  ['floor', 'Floor', 'M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z'],
  ['findings', 'Findings', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z'],
  ['report', 'Report', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
  ['events', 'Events', 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'],
]
const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false }
const tip = { contentStyle: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }, cursor: { fill: 'var(--grid)' } }

/** Start the simulation 4 days back so there's a week of history, then run up to "now". */
function createSim() {
  const start = new Date()
  start.setDate(start.getDate() - 4)
  const sim = new FloorSim({ seed: 20261123, start })
  const now = new Date()
  let mins = now.getHours() * 60 + now.getMinutes()
  if (!sim.cfg.shifts.some((s) => mins >= s.start * 60 && mins < s.end * 60)) mins = 10 * 60 + 30
  sim.runToDayTime(4, Math.floor(mins / 60), mins % 60)
  return sim
}

function nextShiftStart(sim) {
  const d = sim.now
  const mins = d.getHours() * 60 + d.getMinutes()
  const dayStart = sim.t - mins
  const next = sim.cfg.shifts.map((s) => s.start * 60).find((m) => m > mins)
  return next !== undefined ? dayStart + next : dayStart + 1440 + sim.cfg.shifts[0].start * 60
}

export default function FloorView({ switcher }) {
  // The sim is a mutable engine that advances in the timer below; `version` re-renders after each step.
  const [sim] = useState(createSim)

  const [version, setVersion] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [range, setRange] = useState('today')
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('floor')
  const carry = useRef(0)

  useEffect(() => {
    if (!speed) return undefined
    const timer = setInterval(() => {
      carry.current += speed
      const n = Math.floor(carry.current)
      if (n < 1) return
      carry.current -= n
      for (let i = 0; i < n; i++) {
        if (!sim.currentShift()) sim.runTo(nextShiftStart(sim))
        sim.step()
      }
      setVersion((v) => v + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [speed, sim])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => sim.snapshot(), [version, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const report = useMemo(() => sim.report(range), [version, range, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shiftReport = useMemo(() => sim.report('shift'), [version, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hourly = useMemo(() => sim.hourlyFor(fmtDate(sim.now)), [version, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const feed = useMemo(() => sim.recentEvents(25), [version, sim])

  const byId = Object.fromEntries(snap.map((m) => [m.id, m]))
  const selected = byId[selectedId] ?? snap.find((m) => m.status !== 'RUNNING' && m.status !== 'OFF') ?? snap[0]
  const shift = sim.currentShift()
  const running = snap.filter((m) => m.status === 'RUNNING').length
  const stopped = snap.filter((m) => ['JAM', 'WAITING', 'BREAKDOWN'].includes(m.status))
  const level = !shift ? 'off' : snap.some((m) => m.status === 'BREAKDOWN') || stopped.length >= 4 ? 'stop' : stopped.length ? 'warn' : 'ok'
  const summaryText = !shift ? 'Floor is between shifts'
    : stopped.length === 0 ? `All ${running} running machines are making mail`
      : `${running} of ${snap.length} running · ${stopped.slice(0, 2).map((m) => `${m.id} ${m.label.split(' · ')[0].toLowerCase()}`).join(', ')}${stopped.length > 2 ? ` +${stopped.length - 2} more` : ''}`

  const select = (id) => {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 720px)').matches) {
      setTimeout(() => document.getElementById('fdetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }
  const flowmasters = snap.filter((m) => m.type === 'FlowMaster')
  const lines = sim.cfg.lines.map((ids) => ids.map((id) => byId[id]))

  return (
    <div className="app floor" data-ftab={tab}>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--panel-2)" />
            <path d="M6 21l5-9 5 6 4-7 6 10" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>MachineIQ</h1>
            <p className="muted small">Mail floor · 13 machines · 2 shifts</p>
          </div>
        </div>
        {switcher}
        <div className="topbar-right">
          <div className="sim-clock">
            <strong>{sim.now.toLocaleDateString([], { weekday: 'short' })} {fmtTime(sim.now)}</strong>
            <span className="muted small">{shift ? shift.name : 'off shift'}</span>
          </div>
          <div className="segmented" role="group" aria-label="Simulation speed">
            {SPEEDS.map(([label, v]) => (
              <button key={label} className={speed === v ? 'active' : ''} onClick={() => setSpeed(v)}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <main>
        <section className={`summary summary-${level}`} aria-live="polite">
          <span className="dot" />
          <p>{summaryText}</p>
        </section>

        <section className="kpis kpis-4" aria-label="Shift totals">
          <Kpi label="Running" value={running} sub={` of ${snap.length}`} />
          <Kpi label="Made this shift" value={shiftReport.totals.pieces.toLocaleString()} />
          <Kpi label="Per machine-hour" value={shiftReport.totals.piecesPerMachineHour} sub=" pcs" />
          <Kpi label="Shift OEE" value={shiftReport.totals.oee} sub="%" />
        </section>

        <div className="layout">
          <div className="col-main">
            <section className="panel fsec fsec-floor">
              <header className="panel-head">
                <div>
                  <h2>Floor</h2>
                  <p className="muted">Tap a machine for its job, history and fixes</p>
                </div>
                <Legend />
              </header>
              <h3 className="subhead">Inserter lines · inkjet prints the envelopes</h3>
              <div className="flines">
                {lines.map((pair, i) => (
                  <div className="fline" key={i}>
                    <Tile m={pair[0]} selected={selected?.id === pair[0].id} onSelect={select} />
                    <span className="fline-arrow" aria-hidden="true">→</span>
                    <Tile m={pair[1]} selected={selected?.id === pair[1].id} onSelect={select} />
                  </div>
                ))}
              </div>
              <h3 className="subhead">FlowMasters</h3>
              <div className="fgrid">
                {flowmasters.map((m) => <Tile key={m.id} m={m} selected={selected?.id === m.id} onSelect={select} />)}
              </div>
            </section>

            <div className="fsec fsec-floor" id="fdetail">
              {selected && <MachineDetail m={selected} sim={sim} report={report} range={range} version={version} />}
            </div>

            <section className="panel fsec fsec-report">
              <header className="panel-head">
                <div>
                  <h2>Output by hour · today</h2>
                  <p className="muted">Whole floor, pieces per hour (inkjet + inserter counted once)</p>
                </div>
              </header>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="hour" {...axis} interval={1} />
                  <YAxis {...axis} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip {...tip} formatter={(v) => [v.toLocaleString(), 'Pieces']} />
                  <Bar dataKey="pieces" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <Report report={report} range={range} setRange={setRange} />
          </div>

          <div className="col-side">
            <section className="panel fsec fsec-findings">
              <header className="panel-head">
                <div>
                  <h2>Findings</h2>
                  <p className="muted">What the data says to fix · {RANGES.find((r) => r[0] === range)[1].toLowerCase()}</p>
                </div>
                <RangePicker range={range} setRange={setRange} />
              </header>
              {report.insights.length === 0 ? (
                <p className="empty small">Not enough jams yet in this window. Try Today or 5 days.</p>
              ) : (
                <ul className="findings">
                  {report.insights.map((f) => (
                    <li key={f.title} className={`finding finding-${f.level}`}>
                      <strong>{f.title}</strong>
                      <p className="muted">{f.text}</p>
                      <p className="finding-action">→ {f.action}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel fsec fsec-events">
              <header className="panel-head">
                <h2>Event log</h2>
                <span className="badge">{feed.length} latest</span>
              </header>
              <EventList events={feed} onSelect={select} />
            </section>
          </div>
        </div>
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); window.scrollTo({ top: 0 }) }}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{label}</span>
            {key === 'floor' && stopped.length > 0 && <span className="tab-badge">{stopped.length}</span>}
          </button>
        ))}
      </nav>

      <footer className="footer muted small">MachineIQ · Mail floor simulated in your browser · 9 FlowMasters, 2 inkjet → inserter lines · React · Recharts</footer>
    </div>
  )
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}{sub && <small>{sub}</small>}</span>
    </div>
  )
}

function Legend() {
  return (
    <ul className="flegend" aria-label="Status colors">
      {['RUNNING', 'JAM', 'WAITING', 'CHANGEOVER', 'STARVED'].map((k) => (
        <li key={k} className={`st-${STATUS[k].level}`}><span className="dot" />{STATUS[k].text}</li>
      ))}
    </ul>
  )
}

function RangePicker({ range, setRange }) {
  return (
    <div className="segmented" role="group" aria-label="Report window">
      {RANGES.map(([k, label]) => (
        <button key={k} className={range === k ? 'active' : ''} onClick={() => setRange(k)}>{label}</button>
      ))}
    </div>
  )
}

function Tile({ m, selected, onSelect }) {
  const st = STATUS[m.status]
  const detail = m.status === 'RUNNING'
    ? `${m.minsSinceAdjust >= 60 ? `⚠ ${Math.floor(m.minsSinceAdjust / 60)}h ${m.minsSinceAdjust % 60}m since adjust` : 'Running'}`
    : `${m.label}${m.minutes ? ` · ${m.minutes} min` : ''}`
  return (
    <button className={`ftile st-${st.level} ${selected ? 'selected' : ''}`} onClick={() => onSelect(m.id)} aria-pressed={selected}>
      <span className="ftile-head">
        <strong>{m.id}</strong>
        <span className="ftile-pill"><span className="dot" />{st.text}</span>
      </span>
      <span className={`ftile-label ${m.status === 'RUNNING' && m.minsSinceAdjust >= 60 ? 'due' : ''}`}>{detail}</span>
      <span className="ftile-job muted">{m.job.setup} · {m.job.material.replace(' stock', '')}</span>
      <span className="ftile-stats">
        <span><em>{m.shift ? m.shift.pieces.toLocaleString() : '—'}</em> pcs</span>
        <span><em>{m.shift ? m.shift.jams : '—'}</em> jams</span>
        <span><em>{m.shift ? `${Math.round(m.shift.oee)}%` : '—'}</em> OEE</span>
      </span>
    </button>
  )
}

function MachineDetail({ m, sim, report, range, version }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => sim.recentEvents(8, m.id), [sim, m.id, version])
  const stats = report.machines.find((x) => x.id === m.id)
  const myJams = useMemo(() => {
    const keys = new Set(sim.shiftKeys(range))
    const counts = {}
    for (const e of sim.events) {
      if (e.kind !== 'jam' || e.machineId !== m.id || !keys.has(e.shiftKey) || e.t > sim.t) continue
      ;(counts[e.name] ||= { name: e.name, fix: e.fix, n: 0, min: 0 }).n++
      counts[e.name].min += e.minutes
    }
    return Object.values(counts).sort((a, b) => b.n - a.n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, m.id, range, version])
  const st = STATUS[m.status]
  const due = m.minsSinceAdjust >= 60

  return (
    <section className={`panel fdetail st-${st.level}`}>
      <header className="panel-head">
        <div>
          <h2>{m.id} · {m.type}</h2>
          <p className="muted">{m.partner ? `Runs as one line with ${m.partner} · ` : ''}Operator {m.operator}</p>
        </div>
        <span className="ftile-pill big"><span className="dot" />{st.text}</span>
      </header>

      <p className="fdetail-now">{m.status === 'RUNNING' ? 'Running normally' : m.label}{m.minutes ? ` · ${m.minutes} min so far` : ''}{m.until ? ` · about ${m.until} min to go` : ''}</p>

      <dl className="fdetail-grid">
        <div><dt>Job</dt><dd>{m.job.jobId}</dd></div>
        <div><dt>Setup</dt><dd>{m.job.setup}</dd></div>
        <div><dt>Stock</dt><dd className={m.job.material === 'Bad stock' ? 'bad' : ''}>{m.job.material}</dd></div>
        <div><dt>Left in job</dt><dd>{m.job.piecesLeft.toLocaleString()}</dd></div>
        <div><dt>Since adjustment</dt><dd className={due ? 'warn' : ''}>{Math.floor(m.minsSinceAdjust / 60)}h {m.minsSinceAdjust % 60}m{due ? ' · due' : ''}</dd></div>
        <div><dt>Pieces/hr ({RANGES.find((r) => r[0] === range)[1].toLowerCase()})</dt><dd>{stats?.piecesPerHour ?? '—'}</dd></div>
      </dl>

      {stats && (
        <div className="oee-row">
          <Gauge label="Availability" v={stats.availability} />
          <Gauge label="Performance" v={stats.performance} />
          <Gauge label="Quality" v={stats.quality} />
          <Gauge label="OEE" v={stats.oee} strong />
        </div>
      )}

      <h3 className="subhead">Top jams · {RANGES.find((r) => r[0] === range)[1].toLowerCase()}</h3>
      {myJams.length === 0 ? <p className="empty small">No jams in this window.</p> : (
        <ul className="fjams">
          {myJams.slice(0, 4).map((j) => (
            <li key={j.name}><span><strong>{j.name}</strong> ×{j.n} <span className="muted">· {j.min} min</span></span><span className="fl-fix">→ {j.fix}</span></li>
          ))}
        </ul>
      )}

      <h3 className="subhead">Recent events</h3>
      <EventList events={events} compact />
    </section>
  )
}

function Gauge({ label, v, strong }) {
  const lvl = v >= 85 ? 'good' : v >= 65 ? 'ok' : 'bad'
  return (
    <div className={`gauge ${strong ? 'strong' : ''}`}>
      <span className="muted small">{label}</span>
      <strong>{v}%</strong>
      <span className="track"><span className="bar" data-level={lvl} style={{ width: `${Math.min(v, 100)}%` }} /></span>
    </div>
  )
}

function EventList({ events, onSelect, compact }) {
  if (!events.length) return <p className="empty small">Nothing yet.</p>
  return (
    <ul className={`fevents ${compact ? 'compact' : ''}`}>
      {events.map((e, i) => (
        <li key={`${e.t}-${e.machineId}-${i}`} className={`ev-${e.kind}`}>
          <span className="ev-time muted">{e.day} {e.time}</span>
          <span className="ev-main">
            {!compact && (
              <button className="ev-machine" onClick={() => onSelect?.(e.machineId)}>{e.kind === 'changeover' ? e.stationId : e.machineId}</button>
            )}
            <span>{e.name}</span>
            <span className="muted small">
              {e.minutes} min{e.waitForOperatorMin ? ` + ${e.waitForOperatorMin} min waiting` : ''}
              {e.kind === 'breakdown' ? ' · maintenance' : e.operator ? ` · ${e.operator}` : ''}
              {e.kind === 'jam' ? ` · ${e.setup}, ${e.material.replace(' stock', '').toLowerCase()} stock` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Bars({ items, valueKey, format = (v) => v, color = 'var(--amber)' }) {
  const max = Math.max(...items.map((i) => i[valueKey]), 0.0001)
  return (
    <ul className="fbars">
      {items.map((i) => (
        <li key={i.name}>
          <span className="fl-name">{i.name}</span>
          <span className="fl-track"><span className="fl-fill" style={{ width: `${(i[valueKey] / max) * 100}%`, background: color }} /></span>
          <span className="fl-val">{format(i[valueKey], i)}</span>
        </li>
      ))}
    </ul>
  )
}

function Report({ report, range, setRange }) {
  const t = report.totals
  return (
    <section className="panel fsec fsec-report">
      <header className="panel-head">
        <div>
          <h2>Floor report</h2>
          <p className="muted">{report.shifts} shift{report.shifts === 1 ? '' : 's'} · jams, setups, stock and breakdowns</p>
        </div>
        <RangePicker range={range} setRange={setRange} />
      </header>

      <div className="fl-totals ftotals">
        <div><span className="muted small">Pieces</span><strong>{t.pieces.toLocaleString()}</strong></div>
        <div><span className="muted small">Floor OEE</span><strong>{t.oee}%</strong></div>
        <div><span className="muted small">Jams</span><strong>{t.jams}</strong><span className="muted small">{Math.round(t.jamMinutes / 6) / 10} h fixing</span></div>
        <div><span className="muted small">Waiting for operator</span><strong>{t.waitMinutes} min</strong></div>
        <div><span className="muted small">Changeovers</span><strong>{t.changeovers}</strong></div>
        <div><span className="muted small">Breakdowns</span><strong>{t.breakdowns}</strong><span className="muted small">{Math.round(t.breakdownMinutes / 6) / 10} h down</span></div>
      </div>

      <h3 className="subhead">By machine type</h3>
      <table className="stats-table">
        <thead><tr><th>Type</th><th>Machines</th><th>Pcs / hr each</th><th>Jams</th><th>OEE</th></tr></thead>
        <tbody>
          {report.byType.map((g) => (
            <tr key={g.type}><td>{g.type}</td><td>{g.machines}</td><td>{g.piecesPerHour}</td><td>{g.jams}</td><td>{g.oee}%</td></tr>
          ))}
        </tbody>
      </table>

      <h3 className="subhead">Jams by minutes lost (fix + waiting)</h3>
      {report.jamTypes.length ? <Bars items={report.jamTypes} valueKey="minutes" format={(v, i) => `${v} min · ×${i.count}`} /> : <p className="empty small">No jams yet.</p>}

      <div className="fthree">
        <div>
          <h3 className="subhead">Jams / running hr by setup</h3>
          <Bars items={report.setups} valueKey="perHour" color="var(--violet)" />
        </div>
        <div>
          <h3 className="subhead">By paper / envelope stock</h3>
          <Bars items={report.stock} valueKey="perHour" color="var(--red)" />
        </div>
        <div>
          <h3 className="subhead">By time since adjustment</h3>
          <Bars items={report.drift} valueKey="perHour" color="var(--accent)" />
        </div>
      </div>

      <h3 className="subhead">Worst machines</h3>
      <ul className="fworst">
        {report.worst.map((w) => (
          <li key={w.id}>
            <strong>{w.id}</strong>
            <span className="muted small">OEE {w.oee}% · {w.piecesPerHour}/hr · {w.jams} jams{w.breakdownMin ? ` · ${w.breakdownMin} min breakdown` : ''}</span>
            {w.topJam && <span className="fl-fix">{w.topJam.name} ×{w.topJam.count} → {w.topJam.fix}</span>}
          </li>
        ))}
      </ul>

      <h3 className="subhead">Major breakdowns</h3>
      {report.breakdowns.length === 0 ? <p className="empty small">None in this window.</p> : (
        <ul className="fworst">
          {report.breakdowns.map((b) => (
            <li key={b.category}><strong>{b.category}</strong><span className="muted small">×{b.count} · {Math.round(b.minutes / 6) / 10} h down · {b.parts.join(', ')}</span></li>
          ))}
        </ul>
      )}

      {report.byShift.length > 1 && (
        <>
          <h3 className="subhead">By shift</h3>
          <table className="stats-table">
            <thead><tr><th>Shift</th><th>Pieces</th><th>Jams</th><th>Breakdowns</th></tr></thead>
            <tbody>
              {report.byShift.map((s) => (
                <tr key={s.key}><td>{s.label}</td><td>{s.pieces.toLocaleString()}</td><td>{s.jams}</td><td>{s.breakdowns}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

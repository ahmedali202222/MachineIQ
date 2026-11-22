import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FloorSim, fmtDate, fmtTime } from './floorSim'
import { BREAKDOWN_GUIDE, JAM_GUIDE, MACHINE_INFO, SOURCES } from './machineGuide'
import './floor.css'

// Plain words for each machine state.
const STATUS = {
  RUNNING: { text: 'Running', level: 'ok' },
  JAM: { text: 'Jammed', level: 'stop' },
  WAITING: { text: 'Needs operator', level: 'warn' },
  CHANGEOVER: { text: 'Changing job', level: 'info' },
  BREAKDOWN: { text: 'Broken down', level: 'stop' },
  STARVED: { text: 'Paused', level: 'held' },
  OFF: { text: 'Off', level: 'off' },
}
const SPEEDS = [['Pause', 0], ['Normal', 1 / 60], ['Fast', 1], ['Very fast', 10]]
const RANGES = [['shift', 'This shift'], ['today', 'Today'], ['week', '5 days']]
const TABS = [
  ['floor', 'Floor', 'M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z'],
  ['fixes', 'To fix', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z'],
  ['history', 'History', 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'],
  ['report', 'Report', 'M4 20V10M10 20V4M16 20v-7M22 20H2'],
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

/** One short line saying what a machine is doing, e.g. "Front table jam · 4 min". */
function whatsHappening(m) {
  const reason = m.label.split(' · ')[0]
  const made = `${(m.shift?.pieces ?? 0).toLocaleString()} made this shift`
  if (m.status === 'RUNNING') return m.minsSinceAdjust >= 60 ? `${made} · due for adjustment` : made
  if (m.status === 'STARVED') return `${reason} (same line)`
  if (m.status === 'WAITING') return `${reason} · waiting ${m.minutes} min`
  if (m.status === 'CHANGEOVER') return `Setting up ${m.job.setup}`
  if (m.status === 'BREAKDOWN') return `${reason.split(': ')[1] || reason} · maintenance`
  if (m.status === 'OFF') return 'Between shifts'
  return `${reason} · ${m.minutes} min`
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
  const weekTick = Math.floor(version / 30) // the 5-day findings only need refreshing now and then
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekReport = useMemo(() => sim.report('week'), [weekTick, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hourly = useMemo(() => sim.hourlyFor(fmtDate(sim.now)), [version, sim])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const feed = useMemo(() => sim.recentEvents(10), [version, sim])

  const byId = Object.fromEntries(snap.map((m) => [m.id, m]))
  const selected = selectedId ? byId[selectedId] : null
  const shift = sim.currentShift()
  const running = snap.filter((m) => m.status === 'RUNNING').length
  const attention = snap.filter((m) => ['JAM', 'WAITING', 'BREAKDOWN', 'CHANGEOVER'].includes(m.status))
  const problems = attention.filter((m) => m.status !== 'CHANGEOVER')
  const level = !shift ? 'off' : snap.some((m) => m.status === 'BREAKDOWN') || problems.length >= 4 ? 'stop' : problems.length ? 'warn' : 'ok'
  const headline = !shift ? 'The floor is between shifts.'
    : problems.length === 0 ? `All good: ${running} of ${snap.length} machines are running.`
      : `${running} of ${snap.length} machines running · ${problems.length} ${problems.length === 1 ? 'needs' : 'need'} attention`

  const select = (id) => {
    setSelectedId((cur) => (cur === id ? null : id))
    setTimeout(() => document.getElementById('fdetail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }
  const flowmasters = snap.filter((m) => m.type === 'FlowMaster')
  const lines = sim.cfg.lines.map((ids) => ids.map((id) => byId[id]))
  const tile = (m) => <Tile key={m.id} m={m} selected={selectedId === m.id} onSelect={select} />

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
            <p className="muted small">Mail production floor</p>
          </div>
        </div>
        {switcher}
        <div className="sim-clock">
          <strong>{sim.now.toLocaleDateString([], { weekday: 'short' })} {fmtTime(sim.now)}</strong>
          <span className="muted small">{shift ? shift.name : 'off shift'}</span>
        </div>
      </header>

      <main>
        <section className="fintro">
          <p>
            A <strong>simulated mail floor</strong>: 9 FlowMasters and 2 inserter lines, run by operators over 2 shifts.
            Machines run, jam and get fixed like a real shift. <strong>Tap any machine</strong> to see what's going on.
          </p>
          <div className="fspeed">
            <span className="muted small">Speed</span>
            <div className="segmented" role="group" aria-label="Simulation speed">
              {SPEEDS.map(([label, v]) => (
                <button key={label} className={speed === v ? 'active' : ''} onClick={() => setSpeed(v)}>{label}</button>
              ))}
            </div>
          </div>
        </section>

        <section className={`summary summary-${level}`} aria-live="polite">
          <span className="dot" />
          <p>{headline}</p>
        </section>

        <section className="kpis" aria-label="This shift">
          <Kpi label="Running now" value={running} sub={` of ${snap.length}`} />
          <Kpi label="Envelopes this shift" value={shiftReport.totals.pieces.toLocaleString()} />
          <Kpi label="Jams this shift" value={shiftReport.totals.jams} />
        </section>

        <div className="layout">
          <div className="col-main">
            <section className="panel fsec fsec-floor">
              <header className="panel-head"><h2>The floor</h2></header>

              <h3 className="subhead">Inserter lines</h3>
              <p className="muted small fexplain">The inkjet prints the envelope, then the inserter fills it. If one stops, the other pauses.</p>
              <div className="flines">
                {lines.map((pair, i) => (
                  <div className="fline" key={i}>
                    {tile(pair[0])}
                    <span className="fline-arrow" aria-hidden="true">→</span>
                    {tile(pair[1])}
                  </div>
                ))}
              </div>

              <h3 className="subhead">FlowMasters</h3>
              <div className="fgrid">{flowmasters.map(tile)}</div>
            </section>

            <div className="fsec fsec-floor" id="fdetail">
              {selected && <MachineDetail m={selected} sim={sim} version={version} onClose={() => setSelectedId(null)} />}
            </div>
          </div>

          <div className="col-side">
            <section className="panel fsec fsec-floor fsec-fixes">
              <header className="panel-head">
                <div>
                  <h2>Needs attention now</h2>
                  <p className="muted">Machines that are stopped</p>
                </div>
              </header>
              {attention.length === 0 ? (
                <p className="fallgood">✓ Nothing. Every machine is running.</p>
              ) : (
                <ul className="fattn">
                  {attention.map((m) => (
                    <li key={m.id} className={`st-${STATUS[m.status].level}`}>
                      <button onClick={() => select(m.id)}>
                        <strong>{m.id}</strong>
                        <span>{STATUS[m.status].text}: {m.status === 'BREAKDOWN' ? m.label.split(' · ')[0].split(': ')[1] : m.status === 'CHANGEOVER' ? `new job (${m.job.setup})` : m.label.split(' · ')[0]}</span>
                        <span className="muted small">
                          {m.status === 'BREAKDOWN' ? 'Maintenance is working on it' : m.status === 'WAITING' ? `Waiting for ${m.operator}` : m.status === 'CHANGEOVER' ? `${m.operator} is setting up the next job` : `${m.operator} is fixing it`}
                          {m.minutes ? ` · ${m.minutes} min` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel fsec fsec-fixes">
              <header className="panel-head">
                <div>
                  <h2>Top things to fix</h2>
                  <p className="muted">From the last 5 days of jams and downtime</p>
                </div>
              </header>
              <ul className="findings">
                {weekReport.insights.slice(0, 3).map((f) => (
                  <li key={f.title} className={`finding finding-${f.level}`}>
                    <strong>{f.title}</strong>
                    <p className="finding-action">→ {f.action}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel fsec fsec-fixes">
              <header className="panel-head">
                <div>
                  <h2>Jam guide</h2>
                  <p className="muted">Where each jam happens, why, and what to check</p>
                </div>
              </header>
              <div className="fguide">
                {Object.keys(JAM_GUIDE).map((name) => <JamHelp key={name} name={name} />)}
              </div>
              <p className="muted small fsources">
                Machine specs from{' '}
                {SOURCES.map((src, i) => (
                  <span key={src.url}>{i ? ', ' : ''}<a href={src.url} target="_blank" rel="noreferrer">{src.label}</a></span>
                ))}
                . Jam steps are a general guide: follow your site's procedures and lockout rules.
              </p>
            </section>

            <section className="panel fsec fsec-history">
              <header className="panel-head"><h2>What just happened</h2></header>
              <EventList events={feed} now={sim.t} onSelect={select} />
            </section>
          </div>
        </div>

        <details className="panel fsec fsec-report freport" open={tab === 'report' || undefined}>
          <summary>
            <span><strong>Full report</strong> <span className="muted">· output, OEE, jams by setup and stock, breakdowns</span></span>
          </summary>
          <section className="freport-body">
            <h3 className="subhead">Envelopes per hour today (whole floor)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourly} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="hour" {...axis} interval={1} />
                <YAxis {...axis} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip {...tip} formatter={(v) => [v.toLocaleString(), 'Envelopes']} />
                <Bar dataKey="pieces" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <Report report={report} range={range} setRange={setRange} />
          </section>
        </details>
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); window.scrollTo({ top: 0 }) }}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{label}</span>
            {key === 'floor' && problems.length > 0 && <span className="tab-badge">{problems.length}</span>}
          </button>
        ))}
      </nav>

      <footer className="footer muted small">MachineIQ · Simulated mail floor running in your browser · React · Recharts</footer>
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
  const due = m.status === 'RUNNING' && m.minsSinceAdjust >= 60
  return (
    <button className={`ftile st-${st.level} ${selected ? 'selected' : ''}`} onClick={() => onSelect(m.id)} aria-pressed={selected}>
      <strong className="ftile-name">{m.id}</strong>
      <span className="ftile-status"><span className="dot" />{st.text}</span>
      <span className={`ftile-label ${due ? 'due' : ''}`}>{whatsHappening(m)}</span>
    </button>
  )
}

function MachineDetail({ m, sim, version, onClose }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = useMemo(() => sim.recentEvents(5, m.id), [sim, m.id, version])
  const topJams = useMemo(() => {
    const keys = new Set(sim.shiftKeys('week'))
    const counts = {}
    for (const e of sim.events) {
      if (e.kind !== 'jam' || e.machineId !== m.id || !keys.has(e.shiftKey) || e.t > sim.t) continue
      ;(counts[e.name] ||= { name: e.name, fix: e.fix, n: 0 }).n++
    }
    return Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, m.id, version])
  const st = STATUS[m.status]
  const due = m.minsSinceAdjust >= 60
  const info = MACHINE_INFO[m.type]
  const currentJam = ['JAM', 'WAITING'].includes(m.status) ? m.label.split(' · ')[0] : null
  const fixGuide = currentJam ? JAM_GUIDE[currentJam] : null
  const typeNote = { FlowMaster: 'Folds and inserts mail', Inserter: `Fills envelopes printed by ${m.partner}`, Inkjet: `Prints envelopes for ${m.partner}` }[m.type]

  return (
    <section className={`panel fdetail st-${st.level}`}>
      <header className="panel-head">
        <div>
          <h2>{m.id} · {m.type}</h2>
          <p className="muted">{typeNote} · operator {m.operator}</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <p className="fdetail-now">
        <span className="ftile-status"><span className="dot" />{st.text}</span>
        {m.status === 'RUNNING' ? ' Making mail normally.' : ` ${m.label}${m.minutes ? ` · ${m.minutes} min so far` : ''}${m.until ? ` · about ${m.until} min to go` : ''}`}
      </p>

      {fixGuide && (
        <div className="ffix">
          <h3>How to fix: {currentJam}</h3>
          <p className="muted small">{fixGuide.where}</p>
          <ol>{fixGuide.check.map((c) => <li key={c}>{c}</li>)}</ol>
        </div>
      )}
      {m.status === 'BREAKDOWN' && (
        <div className="ffix ffix-stop">
          <h3>Breakdown: call maintenance</h3>
          <p>{BREAKDOWN_GUIDE[m.label.split(':')[0]] ?? BREAKDOWN_GUIDE.Mechanical}</p>
        </div>
      )}

      <dl className="fdetail-grid">
        <div><dt>Job</dt><dd>{m.job.setup} pages</dd></div>
        <div><dt>Paper / envelopes</dt><dd className={m.job.material === 'Bad stock' ? 'bad' : ''}>{m.job.material.replace(' stock', '')}</dd></div>
        <div><dt>Last adjusted</dt><dd className={due ? 'warn' : ''}>{Math.floor(m.minsSinceAdjust / 60) ? `${Math.floor(m.minsSinceAdjust / 60)}h ` : ''}{m.minsSinceAdjust % 60}m ago{due ? ' · due' : ''}</dd></div>
        <div><dt>Made this shift</dt><dd>{m.shift ? m.shift.pieces.toLocaleString() : '—'}</dd></div>
        <div><dt>Jams this shift</dt><dd>{m.shift ? m.shift.jams : '—'}</dd></div>
        <div><dt>Left in this job</dt><dd>{m.job.piecesLeft.toLocaleString()}</dd></div>
      </dl>

      {topJams.length > 0 && (
        <>
          <h3 className="subhead">Its most common jams (5 days) · tap for the fix</h3>
          <div className="fguide">
            {topJams.map((j) => <JamHelp key={j.name} name={j.name} count={j.n} />)}
          </div>
        </>
      )}

      <details className="fabout">
        <summary>About this machine: {info.name}</summary>
        <p>{info.what}</p>
        <dl className="fspecs">
          <div><dt>Made by</dt><dd>{info.maker}</dd></div>
          {info.specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          <div><dt>Sections</dt><dd>{info.sections.join(' → ')}</dd></div>
        </dl>
        {info.floorNote && <p className="muted small">{info.floorNote}</p>}
      </details>

      <h3 className="subhead">Recent</h3>
      <EventList events={events} now={sim.t} compact />
    </section>
  )
}

/** One jam type, expandable: where it happens, usual causes, what to check. */
function JamHelp({ name, count }) {
  const g = JAM_GUIDE[name]
  if (!g) return null
  return (
    <details className="fjam">
      <summary>
        <strong>{name}</strong>{count ? <span className="muted"> ×{count}</span> : null}
        <span className="muted small fjam-where">{g.where}</span>
      </summary>
      <div className="fjam-body">
        <p className="fjam-h">Usually because</p>
        <ul>{g.why.map((w) => <li key={w}>{w}</li>)}</ul>
        <p className="fjam-h">Check</p>
        <ol>{g.check.map((c) => <li key={c}>{c}</li>)}</ol>
        {g.tip && <p className="fjam-tip">{g.tip}</p>}
      </div>
    </details>
  )
}

/** Turn an event into one plain sentence. */
function describe(e, now) {
  const active = e.endT > now
  if (e.kind === 'changeover') return { who: e.stationId, what: `Switched to a new job (${e.setup})`, how: active ? 'setting up now' : `took ${e.minutes} min` }
  if (e.kind === 'breakdown') return { who: e.machineId, what: `Broke down: ${e.part.toLowerCase()} (${e.category.toLowerCase()})`, how: active ? 'maintenance working on it' : `down ${Math.round(e.minutes / 6) / 10} h` }
  const wait = e.waitForOperatorMin ? `, after waiting ${e.waitForOperatorMin} min` : ''
  return { who: e.machineId, what: e.name, how: active ? `${e.operator} fixing now${wait}` : `fixed in ${e.minutes} min by ${e.operator}${wait}` }
}

function EventList({ events, now, onSelect, compact }) {
  if (!events.length) return <p className="empty small">Nothing yet.</p>
  return (
    <ul className={`fevents ${compact ? 'compact' : ''}`}>
      {events.map((e, i) => {
        const d = describe(e, now)
        return (
          <li key={`${e.t}-${e.machineId}-${i}`} className={`ev-${e.kind}`}>
            <span className="ev-time muted">{e.time}</span>
            <span className="ev-main">
              {!compact && <button className="ev-machine" onClick={() => onSelect?.(e.machineId)}>{d.who}</button>}
              <span>{d.what}</span>
              <span className="muted small">{d.how}</span>
            </span>
          </li>
        )
      })}
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

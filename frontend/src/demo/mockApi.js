/**
 * Browser-only demo of MachineIQ.
 *
 * Runs a JavaScript port of the simulator and rules engine inside the page and
 * answers the dashboard's /api calls, so the dashboard can be shown without a
 * server (e.g. as a static page). The real system uses OPC UA, Spring Boot and
 * PostgreSQL; this file only exists for the static demo build (VITE_DEMO=1).
 */
import inserterMd from '../../../backend/src/main/resources/manuals/inserter-manual.md?raw'
import sorterMd from '../../../backend/src/main/resources/manuals/sorter-manual.md?raw'
import labelerMd from '../../../backend/src/main/resources/manuals/labeler-manual.md?raw'
import generalMd from '../../../backend/src/main/resources/manuals/general-reference.md?raw'

const TICK = 1 // seconds per simulation step
const HISTORY_SECONDS = 4 * 3600
const FAULT_NAMES = { 'E-000': 'no fault', 'E-042': 'product jam', 'E-117': 'drive motor over temperature', 'E-208': 'excessive drive-train vibration' }
const T = { warnTemp: 75, tempHyst: 3, warnVib: 7.1, vibHyst: 0.5 }

// ---------- seeded random ----------
let seed = 20261106
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const gauss = (sd) => {
  const u = 1 - rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd
}

// ---------- machine model (port of simulator/machine_model.py) ----------
function makeMachine(id, name, kind, rated, opts = {}) {
  return {
    id, name, kind,
    c: { rated, ambient: 24, maxTemp: 85, jamRate: 2, overheatRate: 0.6, vibRate: 0.4, dropoutRate: 0.5, clearSecs: 45, ...opts },
    s: { state: 'RUNNING', temp: 40, speed: 0, pieces: 0, frac: 0, jam: false, vib: 1.5, fault: 'E-000', sensorOk: true, faultTimer: 0, overheating: false, wear: false, dropTimer: 0 },
  }
}

const chance = (ratePerHour, dt) => rand() < (ratePerHour * dt) / 3600

function step(m, dt) {
  const { c, s } = m
  if (s.state === 'FAULTED') {
    s.faultTimer += dt
    s.speed = Math.max(0, s.speed - c.rated * 0.5 * dt)
    s.temp += (c.ambient + 10 - s.temp) * 0.02 * dt
    s.vib = Math.max(0.3, s.vib * (1 - 0.2 * dt))
    if (s.faultTimer >= c.clearSecs && s.temp < c.maxTemp - 15) {
      if (s.fault === 'E-117') s.overheating = false
      if (s.fault === 'E-208') s.wear = false
      Object.assign(s, { state: 'RUNNING', fault: 'E-000', jam: false })
    }
  } else {
    const target = c.rated * (0.95 + 0.1 * rand())
    s.speed += (target - s.speed) * Math.min(1, 0.3 * dt)
    const load = s.speed / c.rated
    const settle = s.overheating ? c.maxTemp + 15 : c.ambient + 30 * load
    s.temp += (settle - s.temp) * 0.01 * dt + gauss(0.15)
    const baseVib = s.wear ? 12.5 : 1.5 + load
    s.vib = Math.max(0.1, s.vib + (baseVib - s.vib) * 0.05 * dt + gauss(0.05))
    s.frac += (s.speed * dt) / 60
    const whole = Math.floor(s.frac)
    s.pieces += whole
    s.frac -= whole
    if (!s.overheating && chance(c.overheatRate, dt)) s.overheating = true
    if (!s.wear && chance(c.vibRate, dt)) s.wear = true
    if (chance(c.jamRate, dt)) fault(m, 'E-042', true)
    else if (s.temp >= c.maxTemp) fault(m, 'E-117')
    else if (s.vib >= 11) fault(m, 'E-208')
  }
  if (s.sensorOk && chance(c.dropoutRate, dt)) {
    s.sensorOk = false
    s.dropTimer = 0
  }
  if (!s.sensorOk) {
    s.dropTimer += dt
    if (s.dropTimer > 20) s.sensorOk = true
  }
}

function fault(m, code, jam = false) {
  Object.assign(m.s, { state: 'FAULTED', fault: code, faultTimer: 0, jam })
}

function inject(m, problem) {
  if (problem === 'jam') fault(m, 'E-042', true)
  else if (problem === 'overheat') m.s.overheating = true
  else if (problem === 'vibration') m.s.wear = true
  else if (problem === 'dropout') Object.assign(m.s, { sensorOk: false, dropTimer: 0 })
}

// ---------- state ----------
const machines = [
  makeMachine('INS-01', 'Inserter 1', 'Envelope inserter', 180),
  makeMachine('SRT-02', 'Sorter 2', 'Mail sorter', 600, { jamRate: 3 }),
  makeMachine('LBL-03', 'Labeler 3', 'Label applicator', 240, { overheatRate: 1 }),
]
const readings = Object.fromEntries(machines.map((m) => [m.id, []]))
const alerts = []
const open = Object.fromEntries(machines.map((m) => [m.id, {}])) // type -> alert
let nextAlertId = 1
let now = Date.now() - 45 * 60 * 1000 // start with 45 minutes of history

function toReading(m, ts) {
  const s = m.s
  return {
    machineId: m.id,
    ts: new Date(ts).toISOString(),
    state: s.state,
    motorTempC: s.sensorOk ? +s.temp.toFixed(2) : null,
    tempQualityGood: s.sensorOk,
    speedPpm: +s.speed.toFixed(1),
    pieceCount: s.pieces,
    jamSensor: s.jam,
    vibrationMmS: +s.vib.toFixed(2),
    faultCode: s.fault,
  }
}

// ---------- rules engine (port of RulesEngine.java) ----------
function openAlert(id, type, severity, message, faultCode, ts) {
  const a = { id: nextAlertId++, machineId: id, type, severity, message, faultCode, openedAt: new Date(ts).toISOString() }
  alerts.unshift(a)
  open[id][type] = a
}
function closeAlert(id, type, ts) {
  const a = open[id][type]
  if (a) {
    a.closedAt = new Date(ts).toISOString()
    delete open[id][type]
  }
}

function evaluate(r, ts) {
  const id = r.machineId
  const faulted = r.state === 'FAULTED' || r.faultCode !== 'E-000'
  if (faulted) {
    const cur = open[id].FAULT
    if (!cur || cur.faultCode !== r.faultCode) {
      if (cur) closeAlert(id, 'FAULT', ts)
      openAlert(id, 'FAULT', 'CRITICAL', `Machine stopped with fault ${r.faultCode} (${FAULT_NAMES[r.faultCode]})`, r.faultCode, ts)
    }
  } else closeAlert(id, 'FAULT', ts)

  if (!r.tempQualityGood) {
    if (!open[id].SENSOR_FAILURE) openAlert(id, 'SENSOR_FAILURE', 'WARNING', 'Motor temperature sensor is reporting bad quality - check wiring and connector', null, ts)
  } else closeAlert(id, 'SENSOR_FAILURE', ts)

  if (r.tempQualityGood && r.motorTempC != null) {
    if (r.motorTempC >= T.warnTemp) {
      if (!open[id].HIGH_TEMPERATURE) openAlert(id, 'HIGH_TEMPERATURE', 'WARNING', `Motor temperature ${r.motorTempC.toFixed(1)}°C is above the ${T.warnTemp}°C warning limit`, null, ts)
    } else if (r.motorTempC < T.warnTemp - T.tempHyst) closeAlert(id, 'HIGH_TEMPERATURE', ts)
  }
  if (r.vibrationMmS >= T.warnVib) {
    if (!open[id].HIGH_VIBRATION) openAlert(id, 'HIGH_VIBRATION', 'WARNING', `Vibration ${r.vibrationMmS.toFixed(1)} mm/s is in the unsatisfactory band (>= ${T.warnVib} mm/s)`, null, ts)
  } else if (r.vibrationMmS < T.warnVib - T.vibHyst) closeAlert(id, 'HIGH_VIBRATION', ts)
}

function tick() {
  now += TICK * 1000
  for (const m of machines) {
    step(m, TICK)
    const r = toReading(m, now)
    const list = readings[m.id]
    list.push(r)
    if (list.length > HISTORY_SECONDS) list.shift()
    evaluate(r, now)
  }
}

// Build history, with a few scripted problems so the charts have something to show.
const script = { 300: ['SRT-02', 'jam'], 900: ['LBL-03', 'overheat'], 1500: ['INS-01', 'jam'], 2000: ['SRT-02', 'vibration'], 2500: ['INS-01', 'dropout'] }
const backfill = Math.round((Date.now() - now) / 1000)
for (let i = 0; i < backfill; i++) {
  if (script[i]) inject(machines.find((m) => m.id === script[i][0]), script[i][1])
  tick()
}
setInterval(tick, TICK * 1000)

// ---------- manuals search (stand-in for PostgreSQL full-text search) ----------
const STOP = new Set('the and for what why how should check is it my on of to in a an do does can with this that keeps machine threw'.split(' '))
const norm = (t) => t.replace(/\b([A-Za-z])-(\d{3})\b/g, (m0, a, b) => `${m0} ${(a + b).toLowerCase()}`)
const terms = (t) => (norm(t).toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''))

const chunks = []
for (const [file, md] of [['inserter', inserterMd], ['sorter', sorterMd], ['labeler', labelerMd], ['general', generalMd]]) {
  let title = file
  let heading = 'Overview'
  let body = []
  const flush = () => {
    const content = body.join('\n').trim()
    if (content) chunks.push({ source: title, heading, content, head: terms(`${title} ${heading}`), words: terms(content) })
    body = []
  }
  for (const line of md.split('\n')) {
    if (line.startsWith('# ')) title = line.slice(2).trim()
    else if (/^#{2,3} /.test(line)) {
      flush()
      heading = line.replace(/^#+\s*/, '').trim()
    } else body.push(line)
  }
  flush()
}

function search(text, k = 4) {
  const q = new Set(terms(text))
  if (q.size === 0) return []
  return chunks
    .map((c) => {
      let score = 0
      for (const w of q) {
        score += c.head.filter((h) => h === w).length * 3
        score += Math.min(3, c.words.filter((h) => h === w).length) * 0.5
      }
      return { ...c, score }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ---------- manual fault log (kept in this browser's localStorage) ----------
const LOG_KEY = 'machineiq-fault-log'
let faultLog = []
try {
  faultLog = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]')
} catch {
  faultLog = []
}
const saveLog = () => {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(faultLog))
  } catch {
    // storage unavailable: the log lasts until the page is closed
  }
}
const inWindow = (days) => faultLog.filter((f) => Date.parse(f.occurredAt) >= Date.now() - days * 86400000)
function totals(list, key) {
  const m = new Map()
  for (const f of list) {
    const t = m.get(f[key]) ?? { name: f[key], count: 0, minutesDown: 0 }
    t.count += 1
    t.minutesDown += f.minutesDown
    m.set(f[key], t)
  }
  return [...m.values()]
}
function logSummary(days) {
  const list = inWindow(days)
  return {
    days,
    count: list.length,
    minutesDown: list.reduce((a, f) => a + f.minutesDown, 0),
    byMachine: totals(list, 'machineName').sort((a, b) => b.minutesDown - a.minutesDown || b.count - a.count),
    byFault: totals(list, 'fault').sort((a, b) => b.count - a.count || b.minutesDown - a.minutesDown).slice(0, 8),
  }
}
const recentNames = (key) => [...new Set([...faultLog].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).map((f) => f[key]))].slice(0, 50)

// ---------- API ----------
const status = (m) => {
  const latest = readings[m.id].at(-1)
  return {
    id: m.id, name: m.name, kind: m.kind,
    status: latest?.state ?? 'OFFLINE',
    latest,
    faultDescription: latest?.state === 'FAULTED' ? FAULT_NAMES[latest.faultCode] : undefined,
    openAlerts: Object.keys(open[m.id]).length,
  }
}

function history(id, minutes) {
  const since = now - minutes * 60000
  const rows = readings[id].filter((r) => Date.parse(r.ts) >= since)
  const bucket = Math.max(1, Math.floor((minutes * 60) / 300))
  if (bucket <= 1) return rows
  const out = []
  for (let i = 0; i < rows.length; i += bucket) {
    const g = rows.slice(i, i + bucket)
    const avg = (k) => {
      const v = g.map((r) => r[k]).filter((x) => x != null)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    out.push({ ...g[0], state: g.some((r) => r.state === 'FAULTED') ? 'FAULTED' : g[0].state, motorTempC: avg('motorTempC'), speedPpm: avg('speedPpm'), vibrationMmS: avg('vibrationMmS') })
  }
  return out
}

function stats(hours) {
  const since = now - hours * 3600000
  const faultsByCode = {}
  alerts.filter((a) => a.type === 'FAULT' && Date.parse(a.openedAt) >= since).forEach((a) => (faultsByCode[a.faultCode] = (faultsByCode[a.faultCode] ?? 0) + 1))
  return {
    hours,
    faultsByCode,
    machines: machines.map((m) => {
      const rows = readings[m.id].filter((r) => Date.parse(r.ts) >= since)
      const running = rows.filter((r) => r.state === 'RUNNING').length
      const faulted = rows.filter((r) => r.state === 'FAULTED').length
      return {
        machineId: m.id, name: m.name,
        availabilityPct: rows.length ? Math.round((1000 * running) / rows.length) / 10 : 0,
        downtimeMinutes: Math.round((faulted * TICK) / 6) / 10,
        pieces: rows.length ? rows.at(-1).pieceCount - rows[0].pieceCount : 0,
      }
    }),
  }
}

function ask({ question, machineId }) {
  let text = question
  const m = machines.find((x) => x.id === machineId)
  if (m) {
    text += ` ${m.kind} ${m.name}`
    if (m.s.state === 'FAULTED') text += ` ${m.s.fault}`
  }
  const hits = search(text)
  const answer = hits.length
    ? 'Most relevant manual sections:\n\n' + hits.map((h) => `**${h.source} > ${h.heading}**\n${h.content}`).join('\n\n')
    : "I couldn't find anything in the manuals about that. Try naming the fault code (e.g. E-042) or the symptom (jam, overheating, vibration)."
  return { answer, mode: 'search', sources: hits.map((h) => ({ source: h.source, heading: h.heading })) }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function handle(path, init) {
  await new Promise((r) => setTimeout(r, 60))
  const url = new URL(path, 'http://demo')
  const p = url.pathname.replace(/^\/api/, '')
  const q = url.searchParams
  let mm
  if (p === '/config') return json({ demoEnabled: true, aiEnabled: false, browserDemo: true })
  if (p === '/machines') return json(machines.map(status))
  if ((mm = p.match(/^\/machines\/([^/]+)$/))) {
    const m = machines.find((x) => x.id === mm[1])
    return m ? json(status(m)) : json({ detail: 'Unknown machine' }, 404)
  }
  if ((mm = p.match(/^\/machines\/([^/]+)\/readings$/))) return json(history(mm[1], Number(q.get('minutes') ?? 15)))
  if (p === '/alerts') return json(q.get('open') === 'true' ? alerts.filter((a) => !a.closedAt) : alerts.slice(0, Number(q.get('limit') ?? 50)))
  if ((mm = p.match(/^\/alerts\/(\d+)\/ack$/))) {
    const a = alerts.find((x) => x.id === Number(mm[1]))
    if (a && !a.acknowledgedAt) a.acknowledgedAt = new Date(now).toISOString()
    return json({ id: Number(mm[1]), acknowledged: !!a })
  }
  if (p === '/stats') return json(stats(Number(q.get('hours') ?? 24)))
  if (p === '/assistant/ask') {
    const body = JSON.parse(init?.body ?? '{}')
    if (!body.question?.trim()) return json({ detail: 'Question is required' }, 400)
    await new Promise((r) => setTimeout(r, 500))
    return json(ask(body))
  }
  if (p === '/fault-log' && init?.method === 'POST') {
    const b = JSON.parse(init.body)
    const minutesDown = Number(b.minutesDown)
    if (!b.machineName?.trim() || !b.fault?.trim() || !(minutesDown >= 0 && minutesDown <= 1440) || Date.parse(b.occurredAt) > Date.now() + 60000) {
      return json({ detail: '400 invalid fault' }, 400)
    }
    const entry = {
      id: Date.now(),
      machineName: b.machineName.trim(),
      fault: b.fault.trim(),
      description: b.description?.trim() || undefined,
      occurredAt: b.occurredAt,
      minutesDown,
      fix: b.fix?.trim() || undefined,
    }
    faultLog.push(entry)
    saveLog()
    return json(entry, 201)
  }
  if (p === '/fault-log') {
    const days = Number(q.get('days') ?? 30)
    return json(inWindow(days).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)))
  }
  if (p === '/fault-log/summary') return json(logSummary(Number(q.get('days') ?? 30)))
  if (p === '/fault-log/suggestions') return json({ machines: recentNames('machineName'), faults: recentNames('fault') })
  if ((mm = p.match(/^\/fault-log\/(\d+)$/)) && init?.method === 'DELETE') {
    const before = faultLog.length
    faultLog = faultLog.filter((f) => f.id !== Number(mm[1]))
    saveLog()
    return before === faultLog.length ? json({ detail: 'Not found' }, 404) : new Response(null, { status: 204 })
  }
  if ((mm = p.match(/^\/demo\/inject\/([^/]+)\/([^/]+)$/))) {
    const m = machines.find((x) => x.id === mm[1])
    if (!m) return json({ detail: 'Unknown machine' }, 404)
    inject(m, mm[2])
    tick()
    return json({ machineId: m.id, injected: mm[2] })
  }
  return json({ detail: 'Not found' }, 404)
}

/** Routes the dashboard's /api requests to the in-browser simulation. */
export function installMockApi() {
  const realFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const path = typeof input === 'string' ? input : input.url
    return path.startsWith('/api') ? handle(path, init) : realFetch(input, init)
  }
}

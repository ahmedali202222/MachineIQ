/**
 * Mail floor simulator — a minute-by-minute model of a real mail production floor.
 *
 *   - 9 FlowMasters, each run on its own
 *   - 2 inserter lines: an inkjet prints the envelopes for each inserter
 *     (INK-01 -> INS-01, INK-02 -> INS-02); if one stops, the other waits
 *   - 2 shifts a day, 9 operators per shift (two operators cover two stations)
 *
 * What drives the numbers (all in FLOOR_CONFIG):
 *   - job setups: 6x9 or #10 envelopes, 11" or 14" pages
 *   - paper / envelope stock quality per job (bad stock jams more, runs slower)
 *   - adjustment drift: jams creep up the longer a machine runs since its last adjustment
 *   - jams wait for a free operator, then take 5-20 min (camera fixes 3-10 min)
 *   - Keyence camera read fails on inkjets and inserters
 *   - 2-3 changeovers per machine per day
 *   - rare major breakdowns (mechanical / electrical / air) that need maintenance
 *
 * Calibrated to the real floor: ~500-1,000 pieces per machine-hour, ~600,000 pieces a week.
 * Pure JavaScript with no dependencies: used by the dashboard and by scripts/floor-report.mjs.
 */

export const FLOOR_CONFIG = {
  shifts: [
    { name: '1st shift', start: 6, end: 14 },
    { name: '2nd shift', start: 14, end: 22 },
  ],
  operatorsPerShift: 9,

  // ratedSpeed: pieces/hour when a great job runs on a well-adjusted machine.
  machineGroups: [
    { type: 'FlowMaster', count: 9, prefix: 'FM', ratedSpeed: 1200 },
    { type: 'Inserter', count: 2, prefix: 'INS', ratedSpeed: 1200 },
    { type: 'Inkjet', count: 2, prefix: 'INK', ratedSpeed: 1200 },
  ],
  lines: [['INK-01', 'INS-01'], ['INK-02', 'INS-02']],

  envelopes: ['6x9', '#10'],
  pageLengths: ['11"', '14"'],
  jobPieces: { min: 3000, max: 7000 },
  changeoverMinutes: { min: 15, max: 30 },

  materialQuality: [
    { name: 'Good stock', weight: 50, jamMultiplier: 0.7, speed: [0.85, 1.0] },
    { name: 'Normal stock', weight: 35, jamMultiplier: 1.0, speed: [0.7, 0.85] },
    { name: 'Bad stock', weight: 15, jamMultiplier: 2.0, speed: [0.5, 0.7] },
  ],
  setupJamMultiplier: {
    envelope: { '6x9': 1.0, '#10': 1.3 },
    pageLength: { '11"': 1.0, '14"': 1.5 },
  },
  setupSpeedMultiplier: { pageLength: { '11"': 1.0, '14"': 0.9 } },

  baseJamsPerHour: 0.6,
  adjustmentDriftPerHour: 0.25,
  adjustmentMaxDrift: 2.0,
  fixResetsAdjustment: 0.6,
  jamDowntime: { min: 5, max: 20 },

  faults: {
    FlowMaster: [
      { name: 'Front table jam', weight: 30, fix: 'Adjust front table' },
      { name: 'Accumulator jam', weight: 20, fix: 'Clear accumulator, check pages squared' },
      { name: 'Doubles', weight: 20, fix: 'Check separator / feeder gap', rejects: true },
      { name: 'Envelope jam', weight: 15, fix: 'Check envelope hopper and flap' },
      { name: 'Failed to feed', weight: 15, fix: 'Check feeder suction / stack height' },
    ],
    Inserter: [
      { name: 'Front table jam', weight: 25, fix: 'Adjust front table' },
      { name: 'Accumulator jam', weight: 15, fix: 'Clear accumulator, check pages squared' },
      { name: 'Doubles', weight: 15, fix: 'Check separator / feeder gap', rejects: true },
      { name: 'Envelope jam', weight: 15, fix: 'Check envelope hopper and flap' },
      { name: 'Failed to feed', weight: 10, fix: 'Check feeder suction / stack height' },
      { name: 'Camera read fail', weight: 20, fix: 'Adjust camera in Keyence software', rejects: true, downtime: { min: 3, max: 10 } },
    ],
    Inkjet: [
      { name: 'Camera read fail', weight: 40, fix: 'Adjust camera in Keyence software', rejects: true, downtime: { min: 3, max: 10 } },
      { name: 'Bad print / smear', weight: 25, fix: 'Check head height and envelope stock', rejects: true },
      { name: 'Nozzle clog', weight: 20, fix: 'Run purge / clean heads', rejects: true },
      { name: 'Low ink', weight: 15, fix: 'Replace ink cartridge' },
    ],
  },
  rejectsPerFault: { min: 10, max: 60 },
  baseRejectRate: 0.002,

  breakdownsPerRunningHour: 0.004,
  breakdownDowntime: { min: 45, max: 480 },
  breakdownTypes: [
    { category: 'Mechanical', weight: 60, parts: ['Gears', 'Belts', 'Pulleys', 'Wheels', 'Bearings', 'Shafts'] },
    { category: 'Electrical', weight: 20, parts: ['Sensor', 'Motor', 'Wiring', 'Power supply', 'Control board'] },
    { category: 'Air / pneumatic', weight: 20, parts: ['Air leak', 'Low air pressure', 'Valve', 'Cylinder', 'Vacuum pump'] },
  ],
}

const pad = (n) => String(n).padStart(2, '0')
export const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DRIFT_KEYS = ['0-1h', '1-2h', '2h+']
const driftKey = (mins) => (mins < 60 ? '0-1h' : mins < 120 ? '1-2h' : '2h+')

function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const emptyStats = () => ({
  pieces: 0, rejects: 0, runMin: 0, shiftMin: 0, jamMin: 0, waitOperatorMin: 0,
  changeoverMin: 0, breakdownMin: 0, starvedMin: 0, jams: 0, breakdowns: 0,
  driftRunMin: { '0-1h': 0, '1-2h': 0, '2h+': 0 }, materialRunMin: {}, setupRunMin: {},
})

export class FloorSim {
  /**
   * @param {object} opts
   * @param {number} opts.seed   random seed (same seed = same floor history)
   * @param {Date}   opts.start  first simulated day (time of day is ignored)
   */
  constructor({ seed = 1, start = new Date(), config = FLOOR_CONFIG } = {}) {
    this.cfg = config
    this.rand = makeRng(seed)
    this.start = new Date(start)
    this.start.setHours(0, 0, 0, 0)
    this.t = 0 // minutes since start
    this.events = []
    this.buckets = {} // shiftKey -> machineId -> stats
    this.shifts = [] // [{key, label, date, name, startT, endT}]
    this.hourly = {} // 'YYYY-MM-DD HH' -> floor pieces
    this.build()
  }

  // ---------- random helpers ----------
  between(min, max) { return min + this.rand() * (max - min) }
  intBetween(min, max) { return Math.round(this.between(min, max)) }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)] }
  weightedPick(items) {
    const total = items.reduce((s, i) => s + i.weight, 0)
    let r = this.rand() * total
    for (const item of items) if ((r -= item.weight) <= 0) return item
    return items[items.length - 1]
  }
  skewed({ min, max }) { return Math.round(min + (max - min) * Math.pow(this.rand(), 2)) }

  // ---------- setup ----------
  build() {
    const c = this.cfg
    this.machines = {}
    for (const g of c.machineGroups) {
      for (let i = 1; i <= g.count; i++) {
        const id = `${g.prefix}-${pad(i)}`
        this.machines[id] = { id, type: g.type, ratedSpeed: g.ratedSpeed, health: this.between(0.92, 1.0) }
      }
    }
    const inLine = new Set(c.lines.flat())
    const ids = Object.keys(this.machines)
    this.stations = [
      ...ids.filter((id) => !inLine.has(id)).map((id) => [id]),
      ...c.lines,
    ].map((machineIds, i) => ({
      id: machineIds.length > 1 ? `Line ${machineIds[machineIds.length - 1].slice(-1)}` : machineIds[0],
      machineIds,
      operator: i % c.operatorsPerShift,
      jobNum: 0, job: null, piecesLeft: 0,
      downUntil: -1, cur: null, pending: null,
      minsSinceAdjust: Object.fromEntries(machineIds.map((m) => [m, 0])),
    }))
    this.operators = Array.from({ length: c.operatorsPerShift }, (_, i) => ({
      id: `OP-${i + 1}`, busyUntil: -1,
      stations: this.stations.filter((s) => s.operator === i).map((s) => s.id),
    }))
    for (const s of this.stations) {
      s.job = this.newJob(s)
      s.piecesLeft = this.intBetween(c.jobPieces.min, c.jobPieces.max)
    }
  }

  newJob(station) {
    const c = this.cfg
    station.jobNum++
    const job = {
      jobId: `${station.id.replace(' ', '')}-J${station.jobNum}`,
      envelope: this.pick(c.envelopes),
      pageLength: this.pick(c.pageLengths),
      material: this.weightedPick(c.materialQuality),
    }
    job.speedFactor = this.between(...job.material.speed) * c.setupSpeedMultiplier.pageLength[job.pageLength]
    job.setup = `${job.pageLength} into ${job.envelope}`
    return job
  }

  // ---------- time ----------
  dateAt(t) { return new Date(this.start.getTime() + t * 60000) }
  get now() { return this.dateAt(this.t) }

  shiftAt(t) {
    const d = this.dateAt(t)
    const h = d.getHours() + d.getMinutes() / 60
    const shift = this.cfg.shifts.find((s) => h >= s.start && h < s.end)
    if (!shift) return null
    const date = fmtDate(d)
    const key = `${date} ${shift.name}`
    let rec = this.shifts[this.shifts.length - 1]
    if (!rec || rec.key !== key) {
      const dayStart = t - (d.getHours() * 60 + d.getMinutes())
      rec = { key, date, name: shift.name, label: `${d.toLocaleDateString([], { weekday: 'short' })} ${shift.name}`,
        startT: dayStart + shift.start * 60, endT: dayStart + shift.end * 60 }
      this.shifts.push(rec)
      this.buckets[key] = Object.fromEntries(Object.keys(this.machines).map((id) => [id, emptyStats()]))
    }
    return rec
  }

  /** Run the floor until minute `t` (exclusive). */
  runTo(t) { while (this.t < t) this.step() }
  /** Run until a clock time on the current sim day, e.g. runToClock(2, 10, 30) = day 3 at 10:30. */
  runToDayTime(dayIndex, hour, minute = 0) { this.runTo(dayIndex * 1440 + hour * 60 + minute) }

  // ---------- one minute of the floor ----------
  step() {
    const t = this.t
    const shift = this.shiftAt(t)
    if (shift) {
      const b = this.buckets[shift.key]
      const hourKey = `${fmtDate(this.dateAt(t))} ${pad(this.dateAt(t).getHours())}`
      for (const s of this.stations) {
        const made = this.stepStation(s, t, shift, b)
        if (made) this.hourly[hourKey] = (this.hourly[hourKey] || 0) + made
      }
    }
    this.t++
  }

  stepStation(s, t, shift, b) {
    const c = this.cfg
    const ms = s.machineIds.map((id) => this.machines[id])
    const st = (m) => b[m.id]
    ms.forEach((m) => st(m).shiftMin++)

    for (let pass = 0; pass < 5; pass++) {
      // 1) Down for a jam fix / changeover / breakdown
      if (t < s.downUntil) {
        const k = s.cur.kind
        for (const m of ms) {
          if (k === 'changeover') st(m).changeoverMin++
          else if (m.id === s.cur.machineId) st(m)[k === 'jam' ? 'jamMin' : 'breakdownMin']++
          else st(m).starvedMin++
        }
        return 0
      }
      if (s.cur && t >= s.downUntil) s.cur = null

      // 2) Waiting for the operator
      if (s.pending) {
        const op = this.operators[s.operator]
        if (op.busyUntil > t) {
          for (const m of ms) {
            if (s.pending.kind === 'changeover' || m.id === s.pending.machineId) st(m).waitOperatorMin++
            else st(m).starvedMin++
          }
          s.pending.wait++
          return 0
        }
        const p = s.pending
        s.pending = null
        op.busyUntil = t + p.minutes
        s.downUntil = t + p.minutes
        s.cur = { kind: p.kind, name: p.event.name, machineId: p.machineId, startT: t, operator: op.id }
        this.events.push({ ...p.event, operator: op.id, waitForOperatorMin: p.wait,
          t: t - p.wait, fixT: t, endT: t + p.minutes, shiftKey: shift.key })
        if (p.kind === 'changeover') {
          s.job = p.nextJob
          s.piecesLeft = p.nextPieces
          for (const id of s.machineIds) s.minsSinceAdjust[id] = 0
        } else if (p.readjusted) s.minsSinceAdjust[p.machineId] = 0
        continue
      }

      // 3) Job done -> changeover
      if (s.piecesLeft <= 0) {
        const nextJob = this.newJob(s)
        const minutes = this.intBetween(c.changeoverMinutes.min, c.changeoverMinutes.max)
        s.pending = { kind: 'changeover', minutes, wait: 0, nextJob, waitSince: t,
          nextPieces: this.intBetween(c.jobPieces.min, c.jobPieces.max),
          event: { kind: 'changeover', stationId: s.id, machineIds: s.machineIds, machineId: s.machineIds[s.machineIds.length - 1],
            name: `Changeover to ${nextJob.setup}`, jobId: nextJob.jobId, setup: nextJob.setup,
            material: nextJob.material.name, minutes, planned: true } }
        continue
      }

      // 4) Major breakdown
      const broke = ms.find(() => this.rand() < c.breakdownsPerRunningHour / 60)
      if (broke) {
        const bt = this.weightedPick(c.breakdownTypes)
        const part = this.pick(bt.parts)
        const minutes = this.skewed(c.breakdownDowntime)
        const name = `${bt.category}: ${part}`
        s.downUntil = t + minutes
        s.cur = { kind: 'breakdown', name, machineId: broke.id, startT: t }
        st(broke).breakdowns++
        this.events.push({ kind: 'breakdown', stationId: s.id, machineId: broke.id, machineType: broke.type,
          category: bt.category, part, name, jobId: s.job.jobId, setup: s.job.setup, minutes,
          planned: false, needs: 'Maintenance', t, fixT: t, endT: t + minutes, waitForOperatorMin: 0, shiftKey: shift.key })
        continue
      }

      // 5) Jam
      const job = s.job
      const jammed = ms.find((m) => {
        const drift = Math.min(1 + c.adjustmentDriftPerHour * (s.minsSinceAdjust[m.id] / 60), c.adjustmentMaxDrift)
        const mult = c.setupJamMultiplier.envelope[job.envelope] * c.setupJamMultiplier.pageLength[job.pageLength] *
          job.material.jamMultiplier * drift / m.health
        return this.rand() < (c.baseJamsPerHour * mult) / 60
      })
      if (jammed) {
        const fault = this.weightedPick(c.faults[jammed.type])
        const minutes = this.skewed(fault.downtime || c.jamDowntime)
        const rejects = fault.rejects ? this.intBetween(c.rejectsPerFault.min, c.rejectsPerFault.max) : 0
        st(jammed).jams++
        st(jammed).rejects += rejects
        const readjusted = this.rand() < c.fixResetsAdjustment
        s.pending = { kind: 'jam', machineId: jammed.id, minutes, wait: 0, readjusted, waitSince: t,
          event: { kind: 'jam', stationId: s.id, machineId: jammed.id, machineType: jammed.type,
            name: fault.name, fix: fault.fix, jobId: job.jobId, setup: job.setup, material: job.material.name,
            hoursSinceAdjust: Math.round(s.minsSinceAdjust[jammed.id] / 6) / 10,
            minutes, rejects, readjusted, planned: false } }
        continue
      }

      // 6) Running
      const made = Math.round((Math.min(...ms.map((m) => m.ratedSpeed)) / 60) * job.speedFactor * this.between(0.92, 1.05))
      s.piecesLeft -= made
      for (const m of ms) {
        const x = st(m)
        const bad = this.rand() < made * c.baseRejectRate ? 1 : 0
        x.pieces += made
        x.rejects += bad
        x.runMin++
        x.driftRunMin[driftKey(s.minsSinceAdjust[m.id])]++
        x.materialRunMin[job.material.name] = (x.materialRunMin[job.material.name] || 0) + 1
        x.setupRunMin[job.setup] = (x.setupRunMin[job.setup] || 0) + 1
        s.minsSinceAdjust[m.id]++
      }
      return made // floor output counts a line once (inkjet + inserter share the envelopes)
    }
    return 0
  }

  // ---------- live status ----------
  currentShift() { return this.shiftAt(this.t) }

  /** What every machine is doing right now. */
  snapshot() {
    const shift = this.shifts.find((s) => this.t >= s.startT && this.t < s.endT) || null
    const b = shift ? this.buckets[shift.key] : null
    const out = []
    for (const s of this.stations) {
      for (const id of s.machineIds) {
        const m = this.machines[id]
        const partner = s.machineIds.find((x) => x !== id)
        let status = 'RUNNING'
        let label = 'Running'
        let since = null
        if (!shift) { status = 'OFF'; label = 'Between shifts' }
        if (s.cur && this.t < s.downUntil) {
          since = s.cur.startT
          if (s.cur.kind === 'changeover') { status = 'CHANGEOVER'; label = 'Changeover' }
          else if (s.cur.machineId === id) {
            status = s.cur.kind === 'breakdown' ? 'BREAKDOWN' : 'JAM'
            label = s.cur.kind === 'breakdown' ? `${s.cur.name} · maintenance` : `${s.cur.name} · ${s.cur.operator} fixing`
          } else { status = 'STARVED'; label = `Waiting on ${s.cur.machineId}` }
        } else if (s.pending) {
          since = s.pending.waitSince
          const op = this.operators[s.operator].id
          if (s.pending.kind === 'changeover') { status = 'WAITING'; label = `Changeover · waiting for ${op}` }
          else if (s.pending.machineId === id) { status = 'WAITING'; label = `${s.pending.event.name} · waiting for ${op}` }
          else { status = 'STARVED'; label = `Waiting on ${s.pending.machineId}` }
        }
        if (!shift && status !== 'BREAKDOWN') { status = 'OFF'; label = 'Between shifts' }
        const x = b?.[id]
        out.push({
          id, type: m.type, station: s.id, partner, operator: this.operators[s.operator].id,
          status, label, minutes: since === null ? 0 : this.t - since,
          until: s.cur && this.t < s.downUntil ? s.downUntil - this.t : null,
          job: { ...s.job, material: s.job.material.name, piecesLeft: Math.max(0, s.piecesLeft) },
          minsSinceAdjust: s.minsSinceAdjust[id],
          shift: x ? { pieces: x.pieces, jams: x.jams, oee: oeeOf(x, m.ratedSpeed) } : null,
        })
      }
    }
    return out
  }

  /** Shift keys for a range: 'shift' (current/last), 'today', 'week' (all simulated). */
  shiftKeys(range) {
    const started = this.shifts.filter((s) => s.startT <= this.t)
    if (!started.length) return []
    if (range === 'shift') return [started[started.length - 1].key]
    if (range === 'today') {
      const d = started[started.length - 1].date
      return started.filter((s) => s.date === d).map((s) => s.key)
    }
    return started.map((s) => s.key)
  }

  /** Full report for a set of shifts. */
  report(range = 'today') {
    const keys = this.shiftKeys(range)
    const keySet = new Set(keys)
    const c = this.cfg
    const pct = (x) => Math.round(x * 1000) / 10
    const r2 = (x) => Math.round(x * 100) / 100
    const groupBy = (list, fn) => list.reduce((a, x) => { (a[fn(x)] ||= []).push(x); return a }, {})

    // merge buckets per machine
    const merged = {}
    for (const id of Object.keys(this.machines)) {
      const acc = emptyStats()
      for (const k of keys) {
        const x = this.buckets[k][id]
        for (const f of Object.keys(acc)) {
          if (typeof acc[f] === 'number') acc[f] += x[f]
          else for (const [kk, v] of Object.entries(x[f])) acc[f][kk] = (acc[f][kk] || 0) + v
        }
      }
      merged[id] = acc
    }
    const machines = Object.values(this.machines).map((m) => {
      const s = merged[m.id]
      const planned = s.shiftMin - s.changeoverMin
      const availability = planned > 0 ? s.runMin / planned : 0
      const performance = s.runMin > 0 ? Math.min(s.pieces / ((m.ratedSpeed / 60) * s.runMin), 1) : 0
      const quality = s.pieces > 0 ? (s.pieces - s.rejects) / s.pieces : 0
      return { id: m.id, type: m.type, ...s,
        piecesPerHour: s.shiftMin ? Math.round(s.pieces / (s.shiftMin / 60)) : 0,
        availability: pct(availability), performance: pct(performance), quality: pct(quality),
        oee: pct(availability * performance * quality) }
    })

    const events = this.events.filter((e) => keySet.has(e.shiftKey))
    const jams = events.filter((e) => e.kind === 'jam')
    const breakdowns = events.filter((e) => e.kind === 'breakdown')
    const changeovers = events.filter((e) => e.kind === 'changeover')
    const runHrs = (field, key) => machines.reduce((s, m) => s + (m[field][key] || 0), 0) / 60
    const perHr = (n, h) => (h > 0 ? r2(n / h) : 0)

    const byType = Object.entries(groupBy(machines, (m) => m.type)).map(([type, list]) => ({
      type, machines: list.length,
      piecesPerHour: Math.round(list.reduce((s, m) => s + m.piecesPerHour, 0) / list.length),
      jams: list.reduce((s, m) => s + m.jams, 0),
      oee: Math.round(list.reduce((s, m) => s + m.oee, 0) / list.length * 10) / 10,
    }))

    const jamTypes = Object.entries(groupBy(jams, (j) => j.name)).map(([name, list]) => ({
      name, count: list.length, fix: list[0].fix,
      minutes: list.reduce((s, j) => s + j.minutes + j.waitForOperatorMin, 0),
    })).sort((a, b) => b.minutes - a.minutes)

    const setups = Object.entries(groupBy(jams, (j) => j.setup)).map(([setup, list]) => ({
      name: setup, jams: list.length, perHour: perHr(list.length, runHrs('setupRunMin', setup)),
    })).sort((a, b) => b.perHour - a.perHour)

    const stock = c.materialQuality.map((q) => {
      const n = jams.filter((j) => j.material === q.name).length
      return { name: q.name, jams: n, perHour: perHr(n, runHrs('materialRunMin', q.name)) }
    })

    const drift = DRIFT_KEYS.map((k) => {
      const n = jams.filter((j) => driftKey(j.hoursSinceAdjust * 60) === k).length
      const h = runHrs('driftRunMin', k)
      return { name: k, jams: n, runningHours: Math.round(h * 10) / 10, perHour: perHr(n, h) }
    })

    const breakdownCats = Object.entries(groupBy(breakdowns, (b) => b.category)).map(([category, list]) => ({
      category, count: list.length, minutes: list.reduce((s, b) => s + b.minutes, 0),
      parts: Object.entries(groupBy(list, (b) => b.part)).map(([p, l]) => `${p}${l.length > 1 ? ` ×${l.length}` : ''}`),
    })).sort((a, b) => b.minutes - a.minutes)

    const worst = [...machines].filter((m) => m.shiftMin > 0).sort((a, b) => a.oee - b.oee).slice(0, 3).map((m) => {
      const top = Object.entries(groupBy(jams.filter((j) => j.machineId === m.id), (j) => j.name))
        .sort((a, b) => b[1].length - a[1].length)[0]
      return { id: m.id, type: m.type, oee: m.oee, piecesPerHour: m.piecesPerHour, jams: m.jams,
        breakdownMin: m.breakdownMin, topJam: top ? { name: top[0], count: top[1].length, fix: top[1][0].fix } : null }
    })

    const lineInkjets = new Set(c.lines.map((l) => l[0]))
    const pieces = machines.filter((m) => !lineInkjets.has(m.id)).reduce((s, m) => s + m.pieces, 0)
    const waitByOp = groupBy([...jams, ...changeovers].filter((e) => e.waitForOperatorMin > 0), (e) => e.operator)

    const byShift = keys.map((k) => {
      const rec = this.shifts.find((s) => s.key === k)
      const bk = this.buckets[k]
      const p = Object.entries(bk).filter(([id]) => !lineInkjets.has(id)).reduce((s, [, x]) => s + x.pieces, 0)
      return { key: k, label: rec.label, pieces: p,
        jams: Object.values(bk).reduce((s, x) => s + x.jams, 0),
        breakdowns: Object.values(bk).reduce((s, x) => s + x.breakdowns, 0) }
    })

    const totals = {
      pieces,
      rejects: machines.reduce((s, m) => s + m.rejects, 0),
      piecesPerMachineHour: machines.length ? Math.round(machines.reduce((s, m) => s + m.piecesPerHour, 0) / machines.length) : 0,
      jams: jams.length,
      jamMinutes: jams.reduce((s, j) => s + j.minutes, 0),
      waitMinutes: [...jams, ...changeovers].reduce((s, e) => s + e.waitForOperatorMin, 0),
      changeovers: changeovers.length,
      breakdowns: breakdowns.length,
      breakdownMinutes: breakdowns.reduce((s, b) => s + b.minutes, 0),
      oee: machines.length ? Math.round(machines.reduce((s, m) => s + m.oee, 0) / machines.length * 10) / 10 : 0,
    }

    const report = { range, shifts: keys.length, totals, byShift, byType, jamTypes, setups, stock, drift,
      breakdowns: breakdownCats, worst, machines,
      operatorWaits: Object.entries(waitByOp).map(([op, list]) => ({
        op, minutes: list.reduce((s, e) => s + e.waitForOperatorMin, 0),
        stations: this.operators.find((o) => o.id === op)?.stations ?? [],
      })).sort((a, b) => b.minutes - a.minutes),
      cameraFails: Object.entries(groupBy(jams.filter((j) => j.name === 'Camera read fail'), (j) => j.machineId))
        .map(([id, l]) => ({ id, count: l.length })).sort((a, b) => b.count - a.count),
    }
    report.insights = insights(report)
    return report
  }

  /** Events (newest first) for the dashboard feed. */
  recentEvents(limit = 30, machineId = null) {
    const out = []
    for (let i = this.events.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.events[i]
      if (machineId && e.machineId !== machineId && !(e.machineIds || []).includes(machineId)) continue
      if (e.t > this.t) continue
      out.push({ ...e, time: fmtTime(this.dateAt(e.t)), day: this.dateAt(e.t).toLocaleDateString([], { weekday: 'short' }) })
    }
    return out
  }

  /** Floor pieces per hour for one day (06:00-21:00). */
  hourlyFor(date) {
    const out = []
    for (const s of this.cfg.shifts) {
      for (let h = s.start; h < s.end; h++) {
        out.push({ hour: `${pad(h)}:00`, pieces: this.hourly[`${date} ${pad(h)}`] || 0 })
      }
    }
    return out
  }
}

function oeeOf(x, rated) {
  const planned = x.shiftMin - x.changeoverMin
  const a = planned > 0 ? x.runMin / planned : 0
  const p = x.runMin > 0 ? Math.min(x.pieces / ((rated / 60) * x.runMin), 1) : 0
  const q = x.pieces > 0 ? (x.pieces - x.rejects) / x.pieces : 0
  return Math.round(a * p * q * 1000) / 10
}

/** Plain-language findings a supervisor can act on. Each only appears when the data supports it. */
function insights(r) {
  const out = []
  if (r.totals.jams < 8) return out

  const top = r.jamTypes[0]
  if (top) out.push({ level: 'warn', title: `Most time lost: ${top.name}`,
    text: `${top.count} jams, ${top.minutes} min lost (including waiting for an operator).`, action: top.fix })

  const good = r.stock.find((s) => s.name === 'Good stock')
  const bad = r.stock.find((s) => s.name === 'Bad stock')
  if (good?.perHour && bad?.perHour && bad.perHour / good.perHour >= 1.3)
    out.push({ level: 'warn', title: `Bad stock jams ${(bad.perHour / good.perHour).toFixed(1)}× more than good stock`,
      text: `${bad.perHour} vs ${good.perHour} jams per running hour.`, action: 'Flag bad paper / envelope batches to the supervisor or vendor' })

  const worstSetup = r.setups[0]
  const bestSetup = r.setups[r.setups.length - 1]
  if (worstSetup && bestSetup && bestSetup.perHour > 0 && worstSetup.perHour / bestSetup.perHour >= 1.1)
    out.push({ level: 'info', title: `${worstSetup.name} is the hardest setup`,
      text: `${Math.round((worstSetup.perHour / bestSetup.perHour - 1) * 100)}% more jams per hour than ${bestSetup.name}.`,
      action: 'Double-check front table and fold setup at changeover for these jobs' })

  const early = r.drift[0]
  const late = r.drift.slice(1).reduce((a, d) => ({ jams: a.jams + d.jams, h: a.h + d.runningHours }), { jams: 0, h: 0 })
  if (early.perHour > 0 && late.h > 2 && late.jams / late.h > early.perHour * 1.1) {
    const lateRate = late.jams / late.h
    const saved = Math.round((lateRate - early.perHour) * late.h)
    out.push({ level: 'info', title: `Jams rise ${Math.round((lateRate / early.perHour - 1) * 100)}% after an hour without adjustment`,
      text: `${early.perHour}/hr in the first hour vs ${lateRate.toFixed(2)}/hr after.${saved > 0 ? ` About ${saved} fewer jams if machines were re-adjusted hourly.` : ''}`,
      action: 'Quick re-adjust each machine about once an hour' })
  }

  const cam = r.cameraFails[0]
  const camTotal = r.cameraFails.reduce((s, x) => s + x.count, 0)
  if (cam && camTotal >= 3)
    out.push({ level: 'info', title: `${camTotal} camera read fails`, text: `Most on ${cam.id} (${cam.count}).`,
      action: `Check Keyence camera settings on ${cam.id}` })

  const ow = r.operatorWaits[0]
  if (ow && r.totals.waitMinutes >= 15)
    out.push({ level: 'info', title: `${r.totals.waitMinutes} min waiting for an operator`,
      text: `Most at ${ow.op}'s stations (${ow.stations.join(', ')})${ow.stations.length > 1 ? ', who covers two stations' : ''}.`,
      action: 'Have a floater help when two stations stop at once' })

  const bd = r.breakdowns[0]
  if (bd) out.push({ level: 'stop', title: `${r.totals.breakdowns} major breakdown${r.totals.breakdowns > 1 ? 's' : ''}, ${Math.round(r.totals.breakdownMinutes / 6) / 10} h down`,
    text: `Most time lost to ${bd.category.toLowerCase()} (${bd.parts.join(', ')}).`, action: 'Add these parts to the preventive maintenance check' })

  return out
}

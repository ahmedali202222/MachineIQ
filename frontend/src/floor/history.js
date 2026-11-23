/**
 * History for the Jam helper: sample data (clearly labeled, never mixed with real logs)
 * and the summaries the History screen shows.
 *
 * Sample data is generated on the fly from a fixed seed, so it costs no storage and looks the
 * same every time. It covers ~6 months of weekdays, 2 shifts, and is shaped like a real floor:
 * some machines worse than others, front table jams most common, a couple of bad envelope weeks.
 */
import { JAM_GUIDE, MACHINES, PROBLEMS, REPEAT_AT } from './machineGuide'

const DAY = 86400000

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// How often each problem shows up (relative), and how long a fix usually takes (min..max seconds).
const WEIGHT = {
  'Front table jam': 30, 'Accumulator jam': 16, Doubles: 16, 'Envelope jam': 14, 'Failed to feed': 12,
  'Camera read fail': 30, 'Bad print / smear': 14, 'Nozzle clog': 10, 'Low ink': 8,
}
const SECS = {
  'Front table jam': [60, 300], 'Accumulator jam': [120, 600], Doubles: [60, 420], 'Envelope jam': [120, 720],
  'Failed to feed': [60, 300], 'Camera read fail': [120, 600], 'Bad print / smear': [180, 720],
  'Nozzle clog': [180, 600], 'Low ink': [180, 420],
}

/** ~6 months of sample fixes ending yesterday: [{ day, at, machine, type, problem, secs, fix, sample }]. */
export function sampleLog(endDate = new Date(), days = 182) {
  const r = rng(20261122)
  const end = new Date(endDate); end.setHours(0, 0, 0, 0)
  // Each machine gets a "how rough it runs" factor; a few are clearly worse.
  const rough = Object.fromEntries(MACHINES.map((m) => [m.id, 0.7 + r() * 0.6]))
  rough['FM-05'] = 1.7; rough['INK-02'] = 1.5; rough['FM-08'] = 1.3
  // Two bad envelope weeks: envelope jams and doubles jump.
  const badWeeks = [Math.floor(days * 0.3), Math.floor(days * 0.75)]
  const out = []
  for (let d = days; d >= 1; d--) {
    const date = new Date(end.getTime() - d * DAY)
    const dow = date.getDay()
    if (dow === 0 || dow === 6) continue
    const badEnv = badWeeks.some((w) => d <= w + 3 && d >= w - 3)
    for (const m of MACHINES) {
      const n = Math.round((3 + r() * 5) * rough[m.id] * (badEnv ? 1.4 : 1))
      const probs = PROBLEMS[m.type]
      for (let i = 0; i < n; i++) {
        let total = 0
        const w = probs.map((p) => { const x = WEIGHT[p] * (badEnv && (p === 'Envelope jam' || p === 'Doubles') ? 3 : 1) * (m.id === 'FM-05' && p === 'Front table jam' ? 2 : 1); total += x; return x })
        let pick = r() * total
        const problem = probs[w.findIndex((x) => (pick -= x) <= 0)] ?? probs[0]
        const [lo, hi] = SECS[problem]
        const secs = Math.round(lo + (hi - lo) * r() * r())
        const at = date.getTime() + (6 + r() * 16) * 3600000 // between 6:00 and 22:00
        // What fixed it: usually one of the quick steps (earlier steps more often), sometimes a root cause.
        const g = JAM_GUIDE[problem]
        const fix = r() < 0.8
          ? g.quick[Math.min(g.quick.length - 1, Math.floor(r() * r() * g.quick.length))]
          : g.repeat[Math.floor(r() * r() * g.repeat.length)].fix
        out.push({ day: date.toDateString(), at, machine: m.id, type: m.type, problem, secs, fix, sample: true })
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Summaries for the History screen over the last `days` days (ending at `now`). */
export function summarize(log, days, now) {
  const from = now - days * DAY
  const rows = log.filter((e) => e.at >= from && e.at <= now)
  const count = (key) => Object.entries(rows.reduce((a, e) => {
    const k = key(e); a[k] = a[k] || { n: 0, secs: 0 }; a[k].n++; a[k].secs += e.secs || 0; return a
  }, {})).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.secs - a.secs)

  // Jams per week (oldest first), for the trend bars.
  const weeks = []
  const nWeeks = Math.max(1, Math.round(days / 7))
  for (let i = nWeeks - 1; i >= 0; i--) {
    const start = now - (i + 1) * 7 * DAY
    const end = now - i * 7 * DAY
    const inWeek = rows.filter((e) => e.at > start && e.at <= end)
    weeks.push({ label: new Date(start + DAY).toLocaleDateString([], { month: 'short', day: 'numeric' }), n: inWeek.length, secs: inWeek.reduce((s, e) => s + (e.secs || 0), 0) })
  }

  // Days where the same jam hit the same machine REPEAT_AT+ times.
  const perDay = rows.reduce((a, e) => { const k = `${e.day}|${e.machine}|${e.problem}`; a[k] = (a[k] || 0) + 1; return a }, {})
  const repeatDays = Object.entries(perDay).filter(([, n]) => n >= REPEAT_AT).map(([k]) => { const [, machine, problem] = k.split('|'); return { machine, problem } })
  const repeats = Object.entries(repeatDays.reduce((a, r) => { const k = `${r.machine} · ${r.problem}`; a[k] = (a[k] || 0) + 1; return a }, {}))
    .map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n)

  // Jams per machine per week (oldest week first), for the all-machines timeline.
  const timeline = MACHINES.map((m) => ({
    machine: m.id,
    weeks: weeks.map((_, i) => {
      const start = now - (nWeeks - i) * 7 * DAY
      const end = now - (nWeeks - i - 1) * 7 * DAY
      return rows.filter((e) => e.machine === m.id && e.at > start && e.at <= end).length
    }),
  }))

  return {
    timeline,
    total: rows.length,
    secs: rows.reduce((s, e) => s + (e.secs || 0), 0),
    byProblem: count((e) => e.problem),
    byMachine: count((e) => e.machine),
    weeks,
    repeats,
    rows,
  }
}

// Prints a mail floor report from the simulator the dashboard uses.
//   node scripts/floor-report.mjs              -> one day
//   node scripts/floor-report.mjs --days 5     -> a work week
//   node scripts/floor-report.mjs --seed 7 --json > report.json
import { FloorSim } from '../frontend/src/floor/floorSim.js'

const args = process.argv.slice(2)
const get = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const days = Number(get('--days', 1))
const sim = new FloorSim({ seed: Number(get('--seed', 42)), start: new Date(get('--start', '2026-11-23') + 'T00:00:00') })
sim.runTo(days * 1440)
const r = sim.report('week')

if (args.includes('--json')) {
  console.log(JSON.stringify(r, null, 2))
  process.exit(0)
}

const t = r.totals
const L = (s, n) => String(s).padEnd(n)
console.log(`\nMachineIQ mail floor · ${days} day(s) · ${r.shifts} shifts`)
console.log('='.repeat(60))
console.log(`Pieces ${t.pieces.toLocaleString()} · ${t.piecesPerMachineHour}/machine-hr · OEE ${t.oee}%`)
console.log(`Jams ${t.jams} (${t.jamMinutes} min) · waiting for operator ${t.waitMinutes} min`)
console.log(`Changeovers ${t.changeovers} · breakdowns ${t.breakdowns} (${t.breakdownMinutes} min)\n`)
for (const s of r.byShift) console.log(`  ${L(s.label, 18)} ${String(s.pieces.toLocaleString()).padStart(8)} pcs  ${s.jams} jams`)
console.log('\nFindings:')
for (const i of r.insights) console.log(`  • ${i.title}. ${i.text}\n    → ${i.action}`)
console.log()

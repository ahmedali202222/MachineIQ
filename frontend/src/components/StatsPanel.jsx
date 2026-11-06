import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, usePolling } from '../api'

const FAULT_NAMES = { 'E-042': 'Jam', 'E-117': 'Over temp', 'E-208': 'Vibration' }
const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false }
const tip = { contentStyle: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }, cursor: { fill: 'var(--grid)' } }

export default function StatsPanel() {
  const [hours, setHours] = useState(24)
  const { data } = usePolling(() => api.stats(hours), 20000, [hours])

  const machines = data?.machines ?? []
  const faults = Object.entries(data?.faultsByCode ?? {}).map(([code, count]) => ({
    code,
    label: `${code} ${FAULT_NAMES[code] ?? ''}`.trim(),
    count,
  }))

  return (
    <section className="panel stats">
      <header className="panel-head">
        <h2>Availability &amp; downtime</h2>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Time window">
          <option value={1}>Last hour</option>
          <option value={8}>Last shift (8 h)</option>
          <option value={24}>Last 24 h</option>
          <option value={168}>Last 7 days</option>
        </select>
      </header>

      <table className="stats-table">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Availability</th>
            <th>Downtime</th>
            <th>Pieces</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((m) => (
            <tr key={m.machineId}>
              <td>{m.name}</td>
              <td>
                <div className="bar-cell">
                  <div className="track">
                    <div className="bar" style={{ width: `${m.availabilityPct}%` }} data-level={m.availabilityPct >= 90 ? 'good' : m.availabilityPct >= 75 ? 'ok' : 'bad'} />
                  </div>
                  <span>{m.availabilityPct.toFixed(1)}%</span>
                </div>
              </td>
              <td>{m.downtimeMinutes.toFixed(1)} min</td>
              <td>{m.pieces.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="subhead">Faults by code</h3>
      {faults.length === 0 ? (
        <p className="empty small">No faults in this window.</p>
      ) : (
        <ResponsiveContainer width="100%" height={40 + faults.length * 34}>
          <BarChart data={faults} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey="label" width={110} {...axis} />
            <Tooltip {...tip} formatter={(v) => [v, 'Faults']} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {faults.map((f) => (
                <Cell key={f.code} fill={f.code === 'E-117' ? 'var(--red)' : f.code === 'E-208' ? 'var(--violet)' : 'var(--amber)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}

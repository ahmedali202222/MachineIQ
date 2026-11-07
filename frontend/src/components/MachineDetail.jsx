import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, usePolling } from '../api'
import { clock } from '../format'

const RANGES = [
  [15, '15 min'],
  [60, '1 h'],
  [240, '4 h'],
]

const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false }
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />

function tooltipStyle() {
  return {
    contentStyle: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
    labelFormatter: (v) => clock(v),
  }
}

/** Shades the time ranges where the machine was faulted. */
function faultBands(data) {
  const bands = []
  let start = null
  data.forEach((d, i) => {
    if (d.state === 'FAULTED' && start === null) start = d.t
    if ((d.state !== 'FAULTED' || i === data.length - 1) && start !== null) {
      bands.push([start, d.t])
      start = null
    }
  })
  return bands
}

export default function MachineDetail({ machine }) {
  const [minutes, setMinutes] = useState(15)
  const { data } = usePolling(() => api.readings(machine.id, minutes), minutes <= 15 ? 3000 : 15000, [machine.id, minutes])
  const rows = (data ?? []).map((r) => ({ ...r, t: Date.parse(r.ts) }))
  // Show seconds when the visible data covers only a few minutes, so tick labels don't repeat.
  const span = rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0
  const tickLabel = (v) => (span < 6 * 60 * 1000 ? clock(v) : clock(v).slice(0, 5))
  const bands = faultBands(rows)
  const shaded = bands.map(([a, b]) => (
    <ReferenceArea key={a} x1={a} x2={b} fill="var(--red)" fillOpacity={0.12} ifOverflow="extendDomain" />
  ))
  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={['dataMin', 'dataMax']}
      tickFormatter={tickLabel}
      tickCount={6}
      minTickGap={50}
      {...axis}
    />
  )

  return (
    <section className="panel detail">
      <header className="panel-head">
        <div>
          <h2>{machine.name}: last readings</h2>
          <p className="muted">Shaded red = machine was stopped</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Time range">
          {RANGES.map(([m, label]) => (
            <button key={m} role="tab" aria-selected={minutes === m} className={minutes === m ? 'active' : ''} onClick={() => setMinutes(m)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">Waiting for data from {machine.id}…</p>
      ) : (
        <div className="charts">
          <figure>
            <figcaption>Motor temperature (°C)</figcaption>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                {grid}
                {shaded}
                {xAxis}
                <YAxis domain={[20, 100]} {...axis} />
                <ReferenceLine y={75} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: 'Warn 75', fill: 'var(--amber)', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={85} stroke="var(--red)" strokeDasharray="4 4" label={{ value: 'Trip 85', fill: 'var(--red)', fontSize: 10, position: 'insideTopRight' }} />
                <Tooltip {...tooltipStyle()} formatter={(v) => (v == null ? 'sensor fault' : `${v.toFixed(1)} °C`)} />
                <Line type="monotone" dataKey="motorTempC" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} name="Temp" />
              </LineChart>
            </ResponsiveContainer>
          </figure>

          <figure>
            <figcaption>Vibration (mm/s)</figcaption>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                {grid}
                {shaded}
                {xAxis}
                <YAxis domain={[0, 14]} {...axis} />
                <ReferenceLine y={7.1} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: 'Warn 7.1', fill: 'var(--amber)', fontSize: 10, position: 'insideTopRight' }} />
                <Tooltip {...tooltipStyle()} formatter={(v) => `${v.toFixed(2)} mm/s`} />
                <Line type="monotone" dataKey="vibrationMmS" stroke="var(--violet)" strokeWidth={2} dot={false} isAnimationActive={false} name="Vibration" />
              </LineChart>
            </ResponsiveContainer>
          </figure>

          <figure className="wide">
            <figcaption>Speed (pieces / min)</figcaption>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                {grid}
                {shaded}
                {xAxis}
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle()} formatter={(v) => `${Math.round(v)} /min`} />
                <Area type="monotone" dataKey="speedPpm" stroke="var(--green)" fill="var(--green)" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} name="Speed" />
              </AreaChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}
    </section>
  )
}

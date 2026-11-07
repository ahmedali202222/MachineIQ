import { useMemo, useState } from 'react'
import { api, usePolling } from './api'
import AlertsPanel from './components/AlertsPanel'
import Assistant from './components/Assistant'
import FaultLogPanel from './components/FaultLogPanel'
import LogFaultDialog from './components/LogFaultDialog'
import MachineCard from './components/MachineCard'
import MachineDetail from './components/MachineDetail'
import StatsPanel from './components/StatsPanel'

export default function App() {
  const config = usePolling(api.config, 60000)
  const machinesQ = usePolling(api.machines, 2000)
  const alertsQ = usePolling(api.alerts, 3000)
  const [selectedId, setSelectedId] = useState(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logVersion, setLogVersion] = useState(0)
  const [toast, setToast] = useState(null)

  const machines = useMemo(() => machinesQ.data ?? [], [machinesQ.data])
  const machinesById = useMemo(() => Object.fromEntries(machines.map((m) => [m.id, m])), [machines])
  const selected = machinesById[selectedId] ?? machines[0]

  const running = machines.filter((m) => m.status === 'RUNNING').length
  const openAlerts = (alertsQ.data ?? []).filter((a) => !a.closedAt)
  const critical = openAlerts.filter((a) => a.severity === 'CRITICAL').length
  const ppm = machines.reduce((sum, m) => sum + (m.status === 'RUNNING' ? m.latest?.speedPpm ?? 0 : 0), 0)
  const connected = !machinesQ.error && machinesQ.data

  const refresh = () => {
    machinesQ.refresh()
    alertsQ.refresh()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--panel-2)" />
            <path d="M6 21l5-9 5 6 4-7 6 10" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>MachineIQ</h1>
            <p className="muted small">Demo Plant · Line A</p>
          </div>
        </div>
        {config.data?.browserDemo && (
          <a className="demo-tag" href="https://github.com/ahmedali202222/MachineIQ" target="_blank" rel="noreferrer">
            Browser demo · machines simulated in your browser · view the code
          </a>
        )}
        <div className="topbar-right">
          <div className={`live ${connected ? '' : 'live-off'}`}>
            <span className="dot" /> {connected ? 'Live' : 'Connecting to server…'}
          </div>
          <button className="btn-primary btn-log" onClick={() => setLogOpen(true)}>
            + Log fault
          </button>
        </div>
      </header>

      <main>
        <section className="kpis" aria-label="Plant summary">
          <div className="kpi">
            <span className="kpi-label">Machines running</span>
            <span className="kpi-value">
              {running}
              <small>/{machines.length}</small>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Line output</span>
            <span className="kpi-value">
              {Math.round(ppm)}
              <small> pcs/min</small>
            </span>
          </div>
          <div className={`kpi ${openAlerts.length ? 'kpi-alert' : ''}`}>
            <span className="kpi-label">Open alerts</span>
            <span className="kpi-value">
              {openAlerts.length}
              {critical > 0 && <small> · {critical} critical</small>}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Assistant</span>
            <span className="kpi-value kpi-text">{config.data?.aiEnabled ? 'AI mode' : 'Search mode'}</span>
          </div>
        </section>

        <section className="machine-grid" aria-label="Machines">
          {machines.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              selected={selected?.id === m.id}
              onSelect={setSelectedId}
              demoEnabled={config.data?.demoEnabled}
              onInjected={refresh}
            />
          ))}
          {machines.length === 0 && <p className="empty">{machinesQ.error ? `Can't reach the API: ${machinesQ.error.message}` : 'Loading machines…'}</p>}
        </section>

        <div className="layout">
          <div className="col-main">
            {selected && <MachineDetail machine={selected} />}
            <Assistant machines={machines} selectedId={selected?.id} aiEnabled={config.data?.aiEnabled} />
          </div>
          <div className="col-side">
            <AlertsPanel alerts={alertsQ.data} machinesById={machinesById} onChange={alertsQ.refresh} />
            <StatsPanel />
            <FaultLogPanel refreshKey={logVersion} onLogFault={() => setLogOpen(true)} />
          </div>
        </div>
      </main>

      <LogFaultDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={(f) => {
          setLogVersion((v) => v + 1)
          setToast(`Logged: ${f.machineName} · ${f.fault}`)
          setTimeout(() => setToast(null), 3500)
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <footer className="footer muted small">
        MachineIQ · Simulated equipment over OPC UA · Spring Boot · PostgreSQL · React
      </footer>
    </div>
  )
}

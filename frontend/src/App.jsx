import { useMemo, useState } from 'react'
import { api, usePolling } from './api'
import AlertsPanel from './components/AlertsPanel'
import Assistant from './components/Assistant'
import FaultLogPanel from './components/FaultLogPanel'
import LogFaultDialog from './components/LogFaultDialog'
import MachineCard from './components/MachineCard'
import MachineDetail from './components/MachineDetail'
import StatsPanel from './components/StatsPanel'
import { lineSummary } from './health'

// On phones the page shows one of these at a time, picked from the bottom bar.
const TABS = [
  ['machines', 'Machines', 'M3 13h4v7H3zM10 8h4v12h-4zM17 4h4v16h-4z'],
  ['alerts', 'Alerts', 'M12 3l9 16H3zM12 10v4M12 17v.5'],
  ['log', 'Fault log', 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5'],
  ['ask', 'Ask', 'M4 5h16v11H9l-5 4zM8 10h8'],
]

export default function App() {
  const config = usePolling(api.config, 60000)
  const machinesQ = usePolling(api.machines, 2000)
  const alertsQ = usePolling(api.alerts, 3000)
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('machines')
  const [logOpen, setLogOpen] = useState(false)
  const [logVersion, setLogVersion] = useState(0)
  const [toast, setToast] = useState(null)

  const machines = useMemo(() => machinesQ.data ?? [], [machinesQ.data])
  const machinesById = useMemo(() => Object.fromEntries(machines.map((m) => [m.id, m])), [machines])
  const selected = machinesById[selectedId] ?? machines[0]

  const running = machines.filter((m) => m.status === 'RUNNING').length
  const openAlerts = (alertsQ.data ?? []).filter((a) => !a.closedAt)
  const ppm = machines.reduce((sum, m) => sum + (m.status === 'RUNNING' ? m.latest?.speedPpm ?? 0 : 0), 0)
  const connected = !machinesQ.error && machinesQ.data
  const summary = lineSummary(machines)

  const refresh = () => {
    machinesQ.refresh()
    alertsQ.refresh()
  }

  const selectMachine = (id) => {
    setSelectedId(id)
    if (window.matchMedia('(max-width: 720px)').matches) {
      setTimeout(() => document.getElementById('trends')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
  }

  return (
    <div className="app" data-tab={tab}>
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
            Demo · machines simulated in your browser
          </a>
        )}
        <div className="topbar-right">
          <div className={`live ${connected ? '' : 'live-off'}`}>
            <span className="dot" /> {connected ? 'Live' : 'Connecting…'}
          </div>
          <button className="btn-primary btn-log" onClick={() => setLogOpen(true)}>
            + Log fault
          </button>
        </div>
      </header>

      <main>
        <section className={`summary summary-${summary.level}`} aria-live="polite">
          <span className="dot" />
          <p>{summary.text}</p>
        </section>

        <section className="kpis" aria-label="Line totals">
          <div className="kpi">
            <span className="kpi-label">Running</span>
            <span className="kpi-value">
              {running}
              <small> of {machines.length}</small>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Output</span>
            <span className="kpi-value">
              {Math.round(ppm)}
              <small> / min</small>
            </span>
          </div>
          <button className={`kpi kpi-btn ${openAlerts.length ? 'kpi-alert' : ''}`} onClick={() => setTab('alerts')}>
            <span className="kpi-label">Alerts</span>
            <span className="kpi-value">{openAlerts.length}</span>
          </button>
        </section>

        <div className="layout">
          <div className="col-main">
            <section className="sec sec-machines machine-grid" aria-label="Machines">
              {machines.map((m) => (
                <MachineCard
                  key={m.id}
                  machine={m}
                  selected={selected?.id === m.id}
                  onSelect={selectMachine}
                  demoEnabled={config.data?.demoEnabled}
                  onInjected={refresh}
                />
              ))}
              {machines.length === 0 && <p className="empty">{machinesQ.error ? `Can't reach the server: ${machinesQ.error.message}` : 'Loading machines…'}</p>}
            </section>
            <div className="sec sec-machines" id="trends">
              {selected && <MachineDetail machine={selected} />}
            </div>
            <div className="sec sec-ask">
              <Assistant machines={machines} selectedId={selected?.id} aiEnabled={config.data?.aiEnabled} />
            </div>
          </div>
          <div className="col-side">
            <div className="sec sec-alerts">
              <AlertsPanel alerts={alertsQ.data} machinesById={machinesById} onChange={alertsQ.refresh} />
            </div>
            <div className="sec sec-alerts">
              <StatsPanel />
            </div>
            <div className="sec sec-log">
              <FaultLogPanel refreshKey={logVersion} onLogFault={() => setLogOpen(true)} />
            </div>
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
            {key === 'alerts' && openAlerts.length > 0 && <span className="tab-badge">{openAlerts.length}</span>}
          </button>
        ))}
      </nav>

      <LogFaultDialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={(f) => {
          setLogVersion((v) => v + 1)
          setToast(`Saved: ${f.machineName} · ${f.fault}`)
          setTimeout(() => setToast(null), 3500)
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <footer className="footer muted small">MachineIQ · Simulated equipment over OPC UA · Spring Boot · PostgreSQL · React</footer>
    </div>
  )
}

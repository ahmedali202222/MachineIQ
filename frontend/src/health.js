// Plain-language descriptions of machine condition, shared by the cards and the summary.

const FAULT_PLAIN = {
  'E-042': 'Product jam',
  'E-117': 'Motor overheated',
  'E-208': 'Too much vibration',
}

/** Short plain name for a fault code, falling back to the controller's description. */
export function faultName(code, description) {
  return FAULT_PLAIN[code] ?? capitalize(description ?? 'fault')
}

export const LIMITS = { tempWarn: 75, tempTrip: 85, vibRising: 4.5, vibWarn: 7.1 }

/** Returns { level: 'ok' | 'warn' | 'stop' | 'off', text } for a machine status from the API. */
export function machineHealth(m) {
  const r = m.latest
  if (m.status === 'OFFLINE' || !r) return { level: 'off', text: 'No data from this machine' }
  if (m.status === 'FAULTED') {
    return { level: 'stop', text: `Stopped: ${faultName(r.faultCode, m.faultDescription)}` }
  }
  if (r.tempQualityGood === false) return { level: 'warn', text: 'Warning: temperature sensor not reading' }
  if (r.motorTempC >= LIMITS.tempWarn) return { level: 'warn', text: 'Warning: motor getting hot' }
  if (r.vibrationMmS >= LIMITS.vibWarn) return { level: 'warn', text: 'Warning: shaking more than normal' }
  return { level: 'ok', text: 'Running normally' }
}

export function tempHint(r) {
  if (!r || r.tempQualityGood === false) return { level: 'warn', text: 'sensor fault' }
  if (r.motorTempC >= LIMITS.tempTrip) return { level: 'stop', text: 'too hot' }
  if (r.motorTempC >= LIMITS.tempWarn) return { level: 'warn', text: 'hot' }
  return { level: 'ok', text: 'normal' }
}

export function vibrationHint(r) {
  if (!r || r.vibrationMmS == null) return { level: 'off', text: '' }
  if (r.vibrationMmS >= LIMITS.vibWarn) return { level: 'warn', text: 'high' }
  if (r.vibrationMmS >= LIMITS.vibRising) return { level: 'warn', text: 'rising' }
  return { level: 'ok', text: 'normal' }
}

/** One sentence about the whole line, for the top of the page. */
export function lineSummary(machines) {
  if (machines.length === 0) return { level: 'off', text: 'Waiting for machine data…' }
  const stopped = machines.filter((m) => m.status === 'FAULTED')
  const offline = machines.filter((m) => m.status === 'OFFLINE')
  const warned = machines.filter((m) => machineHealth(m).level === 'warn')
  if (stopped.length) {
    const first = stopped[0]
    const more = stopped.length > 1 ? ` and ${stopped.length - 1} more` : ''
    return { level: 'stop', text: `${first.name} is stopped: ${faultName(first.latest?.faultCode, first.faultDescription).toLowerCase()}${more}.` }
  }
  if (offline.length) return { level: 'off', text: `${offline[0].name} is not sending data.` }
  if (warned.length) {
    return { level: 'warn', text: `All machines running. Keep an eye on ${warned.map((m) => m.name).join(', ')}.` }
  }
  return { level: 'ok', text: 'All machines running normally.' }
}

/** Short title for an alert, e.g. "Inserter 1 stopped". */
export function alertTitle(a, machineName) {
  const name = machineName ?? a.machineId
  switch (a.type) {
    case 'FAULT':
      return `${name} stopped`
    case 'HIGH_TEMPERATURE':
      return `${name}: motor getting hot`
    case 'HIGH_VIBRATION':
      return `${name}: shaking more than normal`
    case 'SENSOR_FAILURE':
      return `${name}: temperature sensor not reading`
    case 'COMMUNICATION_LOSS':
      return `${name}: no data`
    default:
      return name
  }
}

/** Plain explanation for an alert's details line. */
export function alertDetail(a) {
  if (a.type === 'FAULT') return `${faultName(a.faultCode)} (code ${a.faultCode})`
  return a.message
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

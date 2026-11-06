export const STATUS_LABEL = {
  RUNNING: 'Running',
  IDLE: 'Idle',
  FAULTED: 'Faulted',
  OFFLINE: 'Offline',
  UNKNOWN: 'Unknown',
}

export const ALERT_LABEL = {
  FAULT: 'Fault',
  HIGH_TEMPERATURE: 'High temperature',
  HIGH_VIBRATION: 'High vibration',
  SENSOR_FAILURE: 'Sensor failure',
  COMMUNICATION_LOSS: 'Communication loss',
}

export function num(value, digits = 1) {
  return value === null || value === undefined ? '—' : Number(value).toFixed(digits)
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

export function clock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function duration(fromIso, toIso) {
  const s = Math.round((new Date(toIso || Date.now()) - new Date(fromIso)) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

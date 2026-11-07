import { useEffect, useRef, useState } from 'react'

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      message = body.detail || body.message || message
    } catch {
      // response had no JSON body
    }
    throw new Error(message)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  config: () => request('/config'),
  machines: () => request('/machines'),
  readings: (id, minutes) => request(`/machines/${id}/readings?minutes=${minutes}`),
  alerts: () => request('/alerts?limit=40'),
  ack: (id) => request(`/alerts/${id}/ack`, { method: 'POST' }),
  stats: (hours) => request(`/stats?hours=${hours}`),
  ask: (question, machineId) =>
    request('/assistant/ask', { method: 'POST', body: JSON.stringify({ question, machineId }) }),
  inject: (machineId, problem) => request(`/demo/inject/${machineId}/${problem}`, { method: 'POST' }),
  faultLog: (days) => request(`/fault-log?days=${days}`),
  faultLogSummary: (days) => request(`/fault-log/summary?days=${days}`),
  faultLogSuggestions: () => request('/fault-log/suggestions'),
  logFault: (entry) => request('/fault-log', { method: 'POST', body: JSON.stringify(entry) }),
  deleteLoggedFault: (id) => request(`/fault-log/${id}`, { method: 'DELETE' }),
}

/**
 * Calls `fetcher` now and then every `intervalMs`. Returns { data, error, refresh }.
 * Requests never overlap, and polling pauses while the browser tab is hidden.
 */
export function usePolling(fetcher, intervalMs, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let cancelled = false
    let timer
    const run = async () => {
      if (!document.hidden) {
        try {
          const result = await fetcherRef.current()
          if (!cancelled) {
            setData(result)
            setError(null)
          }
        } catch (e) {
          if (!cancelled) setError(e)
        }
      }
      if (!cancelled) timer = setTimeout(run, intervalMs)
    }
    run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, tick, ...deps])

  return { data, error, refresh: () => setTick((t) => t + 1) }
}

import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const COMMON_FAULTS = ['Jam', 'Misfeed', 'Double feed', 'Envelope jam', 'Sensor fault', 'Motor overheating', 'Vibration / noise', 'Air pressure low', 'Electrical fault']

/** Value for <input type="datetime-local"> in the browser's local time. */
function localNow() {
  const d = new Date()
  d.setSeconds(0, 0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

const empty = () => ({ machineName: '', fault: '', description: '', occurredAt: localNow(), minutesDown: '', fix: '' })

export default function LogFaultDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState(empty)
  const [suggestions, setSuggestions] = useState({ machines: [], faults: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const dialogRef = useRef(null)
  const firstField = useRef(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setError(null)
      setForm((f) => ({ ...empty(), machineName: f.machineName })) // keep the last machine: usually the same one
      api.faultLogSuggestions().then(setSuggestions).catch(() => {})
      d.showModal()
      setTimeout(() => firstField.current?.focus(), 50)
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await api.logFault({
        ...form,
        occurredAt: new Date(form.occurredAt).toISOString(),
        minutesDown: Number(form.minutesDown || 0),
      })
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message.includes('400') ? 'Please check the fields. The time can\'t be in the future.' : err.message)
    } finally {
      setSaving(false)
    }
  }

  const faultOptions = [...new Set([...suggestions.faults, ...COMMON_FAULTS])]

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="log-fault-title">
      <form onSubmit={submit} className="log-form">
        <header className="dialog-head">
          <h2 id="log-fault-title">Log a fault</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <label>
          Machine
          <input ref={firstField} list="lf-machines" value={form.machineName} onChange={set('machineName')} required maxLength={100} placeholder="e.g. Inserter 2" autoComplete="off" />
          <datalist id="lf-machines">
            {suggestions.machines.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <label>
          Fault
          <input list="lf-faults" value={form.fault} onChange={set('fault')} required maxLength={100} placeholder="e.g. Jam at station 3" autoComplete="off" />
          <datalist id="lf-faults">
            {faultOptions.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>

        <div className="row">
          <label>
            When
            <input type="datetime-local" value={form.occurredAt} onChange={set('occurredAt')} max={localNow()} required />
          </label>
          <label>
            Minutes down
            <input type="number" inputMode="numeric" min="0" max="1440" value={form.minutesDown} onChange={set('minutesDown')} required placeholder="0" />
          </label>
        </div>

        <label>
          What happened <span className="muted">(optional)</span>
          <textarea rows={2} value={form.description} onChange={set('description')} maxLength={2000} placeholder="Envelopes stuck at the insert station" />
        </label>

        <label>
          What fixed it <span className="muted">(optional)</span>
          <textarea rows={2} value={form.fix} onChange={set('fix')} maxLength={2000} placeholder="Cleared jam, cleaned the jam sensor" />
        </label>

        {error && <p className="form-error">{error}</p>}

        <footer className="dialog-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save fault'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

import { useEffect, useState } from 'react'
import { useVehicle } from '@/state/link'
import { useHealth } from '@/state/health'
import { formatTemp, type Units } from '@/state/settings'
import './StatusBar.css'

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function StatusBar({
  units,
  onOpenDiagnostics,
}: {
  units: Units
  onOpenDiagnostics: () => void
}): JSX.Element {
  const state = useVehicle()
  const health = useHealth()
  const now = useClock()

  const volts = state.electrical.batteryV

  return (
    <header className="bar">
      <div className="bar__left">
        <span className="bar__time num">
          {now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="bar__date">
          {now.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div className="bar__right">
        <span className="bar__value num">{formatTemp(state.climate.outsideC, units)}</span>
        <span className="bar__sep" />
        <span className="bar__value num">
          {volts === null ? '--' : volts.toFixed(1)}
          <em>В</em>
        </span>
        <button
          className={`bar__dot bar__dot--${health.tone}`}
          onClick={onOpenDiagnostics}
          title={health.title}
          aria-label={health.title}
        />
      </div>
    </header>
  )
}

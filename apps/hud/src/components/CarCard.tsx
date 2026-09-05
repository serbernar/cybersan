import { useVehicle } from '@/state/link'
import { formatSpeed, type Units } from '@/state/settings'
import { CarView } from './CarView'
import './CarCard.css'

const DOOR_LABEL: Record<string, string> = {
  driver: 'водія',
  passenger: 'пасажира',
  rearLeft: 'задні ліві',
  rearRight: 'задні праві',
  tailgate: 'багажник',
}

/** Always on screen, on every tab — the way a Tesla keeps its own car visible. */
export function CarCard({ units }: { units: Units }): JSX.Element {
  const state = useVehicle()
  const speed = formatSpeed(state.vehicle.speedKph, units)
  const open = Object.entries(state.body.doors)
    .filter(([, isOpen]) => isOpen)
    .map(([name]) => DOOR_LABEL[name] ?? name)

  // "Everything is shut" is a claim, and it needs a sensor behind it. Without
  // one the honest line is that nothing is watching.
  const sensed = state.sources.gpio?.status === 'online'

  return (
    <section className="hero">
      <div className={`hero__speed ${state.vehicle.speedKph === null ? 'is-unknown' : ''}`}>
        <span className="hero__value num">{speed.value}</span>
        <span className="hero__unit">{speed.unit}</span>
      </div>

      <div className="hero__art">
        <CarView
          running={state.engine.running}
          doors={state.body.doors}
          windows={state.body.windows}
          lights={state.body.lights}
          reverse={state.vehicle.gearHint === 'R'}
        />
      </div>

      <footer className={`hero__state ${sensed && open.length ? 'is-alert' : ''}`}>
        {!sensed
          ? 'Датчики кузова не підключені'
          : open.length
            ? `Відчинено: ${open.join(', ')}`
            : 'Все зачинено'}
      </footer>
    </section>
  )
}

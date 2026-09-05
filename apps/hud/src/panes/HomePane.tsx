import type { VehicleState } from '@cybersan/protocol'
import { useVehicle } from '@/state/link'
import { formatDistance, formatTemp, type Units } from '@/state/settings'
import { Arc } from '@/components/Arc'
import './HomePane.css'

const SOURCE_LABEL: Record<string, string> = {
  obd: 'OBD-II',
  gpio: 'Датчики кузова',
  gps: 'GPS',
}

interface Row {
  label: string
  value: string
  note?: string
  critical?: boolean
}

/**
 * Only what is actually measured.
 *
 * Nothing here is filled in from a default: a value the car has not reported is
 * absent from the list, not shown as a zero or a dash pretending to be a
 * reading. A dashboard that guesses is worse than one that admits it is blind.
 */
function buildRows(state: VehicleState, units: Units): Row[] {
  const rows: Row[] = []
  const { engine, electrical, climate, vehicle } = state

  if (engine.coolantC !== null) {
    rows.push({
      label: 'Двигун',
      value: formatTemp(engine.coolantC, units),
      note: engine.running ? 'працює' : 'заглушений',
      critical: engine.coolantC > 105,
    })
  }
  if (electrical.batteryV !== null) {
    rows.push({
      label: 'Бортова мережа',
      value: `${electrical.batteryV.toFixed(1)} В`,
      note: electrical.batteryV > 13.2 ? 'генератор заряджає' : 'від акумулятора',
      critical: electrical.batteryV < 12,
    })
  }
  if (climate.outsideC !== null) {
    rows.push({
      label: 'Назовні',
      value: formatTemp(climate.outsideC, units),
      note: climate.cabinC === null ? undefined : `у салоні ${formatTemp(climate.cabinC, units)}`,
    })
  }
  if (vehicle.odometerKm !== null) {
    rows.push({
      label: 'Пробіг',
      value: formatDistance(vehicle.odometerKm, units),
      note: vehicle.tripKm === null ? undefined : `поїздка ${formatDistance(vehicle.tripKm, units)} км`,
    })
  }
  return rows
}

export function HomePane({ units }: { units: Units }): JSX.Element {
  const state = useVehicle()
  const rows = buildRows(state, units)
  const fuel = state.fuel.levelPct

  const missing = Object.entries(state.sources)
    .filter(([id, info]) => id in SOURCE_LABEL && info?.status !== 'online')
    .map(([id, info]) => ({ label: SOURCE_LABEL[id], detail: info?.detail }))

  return (
    <div className="vitals">
      {fuel !== null && (
        <div className="vitals__range">
          <Arc value={fuel} max={100} tone={fuel < 15 ? 'crit' : 'accent'} />
          <div>
            <span className="label">Запас ходу</span>
            <p className="vitals__big num">
              {state.fuel.rangeKm ?? '--'}<em>км</em>
            </p>
            <p className="vitals__note num">{fuel}% у баку</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <dl className="vitals__list">
          {rows.map((row) => (
            <div className="vitals__row" key={row.label}>
              <dt className="label">{row.label}</dt>
              <dd>
                <span className={`vitals__value num ${row.critical ? 'is-crit' : ''}`}>{row.value}</span>
                {row.note && <span className="vitals__note">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {missing.length > 0 && (
        <section className="vitals__pending">
          <h2 className="label">Ще не підключено</h2>
          <ul>
            {missing.map((item) => (
              <li key={item.label}>
                <b>{item.label}</b>
                {item.detail && <span>{item.detail}</span>}
              </li>
            ))}
          </ul>
          <p className="vitals__hint">
            Показники двигуна, швидкість і пробіг зʼявляться тут самі, щойно джерело почне
            віддавати дані.
          </p>
        </section>
      )}
    </div>
  )
}

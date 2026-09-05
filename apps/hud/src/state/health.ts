import type { VehicleState, WarningId } from '@cybersan/protocol'
import { useLinkStatus, useVehicle } from './link'

export type Health = 'ok' | 'warn' | 'fault' | 'connecting'

/** Faults that mean "stop driving", as opposed to "something is not wired yet". */
const CRITICAL: WarningId[] = ['coolantTemp', 'oilPressure', 'brake', 'battery']

export interface HealthReport {
  tone: Health
  /** Shown on the diagnostics screen and as the dot's accessible name. */
  title: string
}

function offlineSources(state: VehicleState): string[] {
  return Object.entries(state.sources)
    .filter(([, info]) => info?.status === 'offline' || info?.status === 'degraded')
    .map(([id]) => id)
}

/**
 * One dot, three meanings — so the header stays silent until it has something
 * to say. Words in a status bar are read once and then never again; a colour
 * that is normally green is noticed the moment it stops being green.
 */
export function useHealth(): HealthReport {
  const state = useVehicle()
  const link = useLinkStatus()

  if (link === 'connecting') {
    return { tone: 'connecting', title: 'Підключення до демона' }
  }

  if (link === 'offline') {
    return { tone: 'fault', title: 'Немає звʼязку з демоном — дані застаріли' }
  }

  const critical = state.warnings.filter((id) => CRITICAL.includes(id))
  if (critical.length > 0) {
    return { tone: 'fault', title: `Несправність: ${critical.join(', ')}` }
  }

  const missing = offlineSources(state)
  if (missing.length > 0) {
    return { tone: 'warn', title: `Джерела недоступні: ${missing.join(', ')}` }
  }

  return { tone: 'ok', title: 'Усі системи в нормі' }
}

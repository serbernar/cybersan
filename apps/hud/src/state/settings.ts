import { useCallback, useEffect, useState } from 'react'

export type Theme = 'night' | 'day'
export type Units = 'metric' | 'imperial'
/**
 * There is no "home" button, because home is what is behind everything else.
 * Settings opens over it and closes again — the way a Tesla does it.
 */
export type ScreenId = 'home' | 'settings'
/** Panel orientation. Landscape fits a 2DIN slot; portrait needs a custom mount. */
export type Layout = 'landscape' | 'portrait'

export interface Settings {
  theme: Theme
  layout: Layout
  units: Units
  /** Screen dim level, 20–100. Applied as an overlay until real backlight PWM. */
  brightness: number
  showSplash: boolean
}

const DEFAULTS: Settings = {
  theme: 'night',
  layout: 'landscape',
  units: 'metric',
  brightness: 100,
  showSplash: true,
}

const KEY = 'cybersan.settings.v1'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    // Merge over defaults so a new field never leaves the HUD half-configured.
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULTS
  }
}

export function useSettings(): [Settings, <K extends keyof Settings>(key: K, value: Settings[K]) => void] {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // A read-only profile must not take the dashboard down.
    }
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.layout = settings.layout
  }, [settings])

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  return [settings, update]
}

export function formatSpeed(kph: number | null, units: Units): { value: string; unit: string } {
  if (kph === null) return { value: '--', unit: units === 'metric' ? 'km/h' : 'mph' }
  const v = units === 'metric' ? kph : kph * 0.621371
  return { value: String(Math.round(v)), unit: units === 'metric' ? 'km/h' : 'mph' }
}

export function formatTemp(celsius: number | null, units: Units): string {
  if (celsius === null) return '--'
  return units === 'metric'
    ? `${Math.round(celsius)}°C`
    : `${Math.round(celsius * 1.8 + 32)}°F`
}

export function formatDistance(km: number | null, units: Units): string {
  if (km === null) return '--'
  const v = units === 'metric' ? km : km * 0.621371
  return v >= 1000 ? v.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) : v.toFixed(1)
}

/*
 * cybersan — vehicle state contract.
 *
 * This file is the single source of truth for everything that crosses the wire
 * between the Python daemon and the HUD. The daemon mirrors these shapes from
 * `default-state.json`; nothing else may invent a payload field.
 */

export const SCHEMA_VERSION = 1 as const

/** Where a value came from. Every signal is attributable, including fakes. */
export type SourceId = 'obd' | 'gpio' | 'gps' | 'system' | 'media' | 'mock'

export type SourceStatus = 'online' | 'degraded' | 'offline' | 'disabled'

export interface SourceInfo {
  status: SourceStatus
  /** Human readable reason, shown in Settings → Diagnostics. */
  detail?: string
  /** Seconds since this source last produced a value. */
  age?: number
}

/** Per-signal provenance, keyed by dot path (e.g. `engine.rpm`). */
export interface SignalMeta {
  src: SourceId
  /** false = the value is stale or the source failed; UI must dim it. */
  ok: boolean
  age: number
}

export type Ignition = 'off' | 'acc' | 'on' | 'crank'

/** A phone the head unit knows about. */
export interface BluetoothDevice {
  address: string
  name: string
  connected: boolean
  paired: boolean
}

export interface BluetoothAdapter {
  /** The name phones see when scanning. */
  alias: string | null
  discoverable: boolean
  /** Seconds left in the pairing window, 0 when it is closed. */
  discoverableFor: number
  pairable: boolean
}
export type Playback = 'stopped' | 'playing' | 'paused'
export type MediaSource = 'none' | 'bluetooth' | 'usb' | 'radio'

/** A door/latch is `true` when open. */
export interface Doors {
  driver: boolean
  passenger: boolean
  rearLeft: boolean
  rearRight: boolean
  tailgate: boolean
}

/** Window aperture in percent, 0 = closed. */
export interface Windows {
  driver: number
  passenger: number
  rearLeft: number
  rearRight: number
}

export interface Lights {
  lowBeam: boolean
  highBeam: boolean
  fog: boolean
  hazard: boolean
  turnLeft: boolean
  turnRight: boolean
}

export type WarningId =
  | 'checkEngine'
  | 'battery'
  | 'oilPressure'
  | 'coolantTemp'
  | 'lowFuel'
  | 'doorOpen'
  | 'brake'
  | 'absFault'
  | 'obdOffline'

/**
 * A full snapshot of the car as the daemon currently understands it.
 * `null` means "no source can tell us this right now" — it is never a zero.
 */
export interface VehicleState {
  schema: typeof SCHEMA_VERSION
  /** Daemon clock, ms since epoch. */
  ts: number
  vehicle: {
    model: string
    speedKph: number | null
    odometerKm: number | null
    tripKm: number | null
    gearHint: string | null
  }
  engine: {
    rpm: number | null
    coolantC: number | null
    intakeC: number | null
    loadPct: number | null
    running: boolean
  }
  electrical: {
    batteryV: number | null
    ignition: Ignition
  }
  fuel: {
    levelPct: number | null
    rangeKm: number | null
    consumptionLp100: number | null
  }
  body: {
    doors: Doors
    windows: Windows
    lights: Lights
  }
  climate: {
    outsideC: number | null
    cabinC: number | null
  }
  media: {
    playback: Playback
    title: string | null
    artist: string | null
    album: string | null
    positionS: number
    durationS: number
    volume: number
    muted: boolean
    source: MediaSource
  }
  bluetooth: {
    adapter: BluetoothAdapter
    devices: BluetoothDevice[]
  }
  position: {
    lat: number | null
    lon: number | null
    altitudeM: number | null
    headingDeg: number | null
    satellites: number
  }
  system: {
    cpuTempC: number | null
    cpuLoadPct: number | null
    uptimeS: number
    hostname: string | null
  }
  warnings: WarningId[]
  sources: Partial<Record<SourceId, SourceInfo>>
  meta: Record<string, SignalMeta>
}

/* ---------------------------------------------------------------- wire ---- */

/** Full state, sent on connect and after any schema-level change. */
export interface SnapshotMessage {
  t: 'snapshot'
  state: VehicleState
}

/**
 * Incremental update. `set` is a flat map of dot paths to values, so both ends
 * stay trivial — no JSON Patch dependency, no array index bookkeeping.
 */
export interface PatchMessage {
  t: 'patch'
  ts: number
  set: Record<string, unknown>
}

/** One-shot notification that is not part of the state (chimes, toasts). */
export interface EventMessage {
  t: 'event'
  ts: number
  name: string
  data?: Record<string, unknown>
}

export type ServerMessage = SnapshotMessage | PatchMessage | EventMessage

/** HUD → daemon. Commands are named, never raw writes into the state tree. */
export interface CommandMessage {
  t: 'cmd'
  /** Correlates the ack; any string unique per connection. */
  id: string
  name: CommandName
  args?: Record<string, unknown>
}

export type CommandName =
  | 'media.play'
  | 'media.pause'
  | 'media.next'
  | 'media.prev'
  | 'media.volume'
  /** Toggles the head unit's own output mute. */
  | 'media.mute'
  | 'settings.set'
  | 'system.restartHud'
  | 'demo.scenario'
  /** Open the pairing window; args: { seconds }. */
  | 'bt.pair'
  | 'bt.pairStop'
  /** Drop the audio link but keep the pairing; args: { address }. */
  | 'bt.disconnect'
  /** Remove the pairing entirely; args: { address }. */
  | 'bt.forget'
  /** Rename the adapter; args: { name }. */
  | 'bt.rename'

export interface AckMessage {
  t: 'ack'
  id: string
  ok: boolean
  error?: string
}

export type ClientMessage = CommandMessage

/* --------------------------------------------------------------- utils ---- */

/** Read a dot path out of a snapshot without hand-written optional chains. */
export function readPath(state: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, state)
}

/** Apply a `PatchMessage.set` map onto a draft, creating no new branches. */
export function applyPatch<T extends object>(draft: T, set: Record<string, unknown>): T {
  for (const [path, value] of Object.entries(set)) {
    const keys = path.split('.')
    const last = keys.pop()
    if (!last) continue
    let node: Record<string, unknown> = draft as Record<string, unknown>
    let reachable = true
    for (const key of keys) {
      const next = node[key]
      if (next === null || typeof next !== 'object') {
        // Unknown branch: the daemon is ahead of this HUD build. Drop it rather
        // than growing an untyped shadow tree.
        reachable = false
        break
      }
      node = next as Record<string, unknown>
    }
    if (reachable) node[last] = value
  }
  return draft
}

/** True when a signal is present and its source is currently trustworthy. */
export function isLive(state: VehicleState, path: string): boolean {
  const meta = state.meta[path]
  if (!meta) return readPath(state, path) !== null
  return meta.ok
}

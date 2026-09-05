import defaultState from '@cybersan/protocol/default-state.json'
import {
  applyPatch,
  type ClientMessage,
  type CommandName,
  type ServerMessage,
  type VehicleState,
} from '@cybersan/protocol'

export type LinkStatus = 'connecting' | 'live' | 'offline'

type Listener = () => void

/**
 * Owns the only mutable copy of the vehicle state in the HUD.
 *
 * Exposed through useSyncExternalStore, so patches re-render the tree once per
 * tick instead of once per subscriber. When the daemon is unreachable the last
 * known state stays on screen and the status dot turns red: a dashboard that
 * invents numbers to fill a gap is worse than one that admits the gap.
 */
/**
 * Correlation id for a command.
 *
 * Deliberately not crypto.randomUUID(): that exists only in a secure context,
 * and the HUD is served over plain HTTP from the car's own IP. Calling it there
 * throws, which silently killed every button pressed from a phone or laptop.
 */
let commandCounter = 0
function nextCommandId(): string {
  commandCounter += 1
  return `${Date.now().toString(36)}-${commandCounter}`
}

export interface LinkError {
  text: string
  /** Lets the UI tell a repeat of the same failure from a stale one. */
  ts: number
}

export class VehicleLink {
  private state: VehicleState
  private listeners = new Set<Listener>()
  private socket: WebSocket | null = null
  private retry = 0
  private retryTimer: number | undefined
  private status: LinkStatus = 'connecting'
  private closed = false
  private error: LinkError | null = null

  constructor(private readonly url: string) {
    this.state = structuredClone(defaultState) as unknown as VehicleState
  }

  getSnapshot = (): VehicleState => this.state

  getStatus = (): LinkStatus => this.status

  getError = (): LinkError | null => this.error

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect(): void {
    this.openSocket()
  }

  dispose(): void {
    this.closed = true
    window.clearTimeout(this.retryTimer)
    this.socket?.close()
  }

  send(name: CommandName, args?: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.fail('Немає звʼязку з демоном')
      return
    }
    const msg: ClientMessage = { t: 'cmd', id: nextCommandId(), name, args }
    this.socket.send(JSON.stringify(msg))
  }

  private fail(text: string): void {
    this.error = { text, ts: Date.now() }
    this.emit()
  }

  private openSocket(): void {
    this.setStatus('connecting')
    const socket = new WebSocket(this.url)
    this.socket = socket

    socket.onopen = () => {
      this.retry = 0
      this.setStatus('live')
    }

    socket.onmessage = (event) => {
      let msg: ServerMessage | { t: 'ack'; ok: boolean; error?: string }
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (msg.t === 'ack') {
        if (!msg.ok) this.fail(msg.error ?? 'Команду відхилено')
        return
      }
      this.ingest(msg)
    }

    socket.onclose = () => {
      if (this.closed) return
      this.socket = null
      this.retry += 1
      // The last known state stays on screen, marked as stale by the status
      // dot. Inventing numbers to fill the gap would be worse than a gap.
      if (this.retry >= 2) this.setStatus('offline')
      const delay = Math.min(500 * 2 ** this.retry, 10_000)
      this.retryTimer = window.setTimeout(() => this.openSocket(), delay)
    }

    socket.onerror = () => socket.close()
  }

  private ingest(msg: ServerMessage): void {
    if (msg.t === 'snapshot') {
      this.state = msg.state
    } else if (msg.t === 'patch') {
      this.state = applyPatch(structuredClone(this.state), msg.set)
      this.state.ts = msg.ts
    } else {
      return
    }
    this.emit()
  }

  private setStatus(status: LinkStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function defaultSocketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  // In `vite dev` the daemon lives on its own port; in kiosk both share an origin.
  const host = import.meta.env.DEV ? `${location.hostname}:8322` : location.host
  return `${proto}//${host}/ws`
}

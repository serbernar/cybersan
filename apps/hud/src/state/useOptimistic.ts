import { useEffect, useRef, useState } from 'react'

/**
 * Shows the value the user just chose until the daemon confirms it.
 *
 * Every control here is server-authoritative, which is right for a car — the
 * screen must never claim a state the hardware is not in. But a round trip
 * through the daemon and PipeWire takes long enough that a volume slider
 * dragged with a thumb snaps backwards under the finger. So the local choice
 * wins until the reported value actually changes, and then the daemon wins
 * again — including when the change came from somewhere else, like the phone.
 */
export function useOptimistic<T>(reported: T): [T, (value: T) => void] {
  const [local, setLocal] = useState<T | null>(null)
  const lastReported = useRef(reported)

  useEffect(() => {
    if (reported !== lastReported.current) {
      lastReported.current = reported
      setLocal(null)
    }
  }, [reported])

  return [local ?? reported, setLocal]
}

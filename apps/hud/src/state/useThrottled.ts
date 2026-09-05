import { useCallback, useEffect, useRef } from 'react'

/**
 * Rate-limits a command while keeping the last value.
 *
 * A range input fires on every pixel of a drag. Sending each one spawns a
 * separate wpctl process on the Pi, and they queue up until the daemon is
 * visibly behind the thumb. Leading edge plus a trailing call means the first
 * movement is instant, the drag costs a few commands a second, and the value
 * the finger stopped on is always the one that gets applied.
 */
export function useThrottled<T>(fn: (value: T) => void, intervalMs = 120): (value: T) => void {
  const last = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<T | undefined>(undefined)
  const latestFn = useRef(fn)
  latestFn.current = fn

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return useCallback(
    (value: T) => {
      pending.current = value
      const now = performance.now()
      const wait = intervalMs - (now - last.current)

      if (wait <= 0) {
        last.current = now
        latestFn.current(value)
        return
      }
      if (timer.current !== undefined) return

      timer.current = window.setTimeout(() => {
        timer.current = undefined
        last.current = performance.now()
        if (pending.current !== undefined) latestFn.current(pending.current)
      }, wait)
    },
    [intervalMs],
  )
}

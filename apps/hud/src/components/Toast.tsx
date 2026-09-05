import { useEffect, useState } from 'react'
import { useCommandError } from '@/state/link'
import './Toast.css'

/**
 * Surfaces a rejected command.
 *
 * Without this a failing button is indistinguishable from a working one, which
 * is how a broken command id went unnoticed until someone pressed "forget" and
 * nothing happened.
 */
export function Toast(): JSX.Element | null {
  const error = useCommandError()
  const [shown, setShown] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    setShown(error.text)
    const id = window.setTimeout(() => setShown(null), 4000)
    return () => window.clearTimeout(id)
  }, [error])

  if (!shown) return null
  return <div className="toast" role="status">{shown}</div>
}

import { useEffect, useState } from 'react'
import './BootScreen.css'

/**
 * Application splash, not a Linux boot animation.
 * Plymouth/quiet-boot work comes later; this only covers the window between
 * Chromium painting and the HUD having its first snapshot.
 */
export function BootScreen({ onDone, durationMs = 2200 }: { onDone: () => void; durationMs?: number }): JSX.Element {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), durationMs - 350)
    const done = window.setTimeout(onDone, durationMs)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(done)
    }
  }, [durationMs, onDone])

  return (
    <div className={`boot ${leaving ? 'is-leaving' : ''}`}>
      <div className="boot__mark">
        <span className="boot__word">CYBER</span>
        <span className="boot__word boot__word--accent">SAN</span>
      </div>
      <p className="boot__sub">NISSAN X-TRAIL · T30</p>
      <div className="boot__bar"><i style={{ animationDuration: `${durationMs - 300}ms` }} /></div>
    </div>
  )
}

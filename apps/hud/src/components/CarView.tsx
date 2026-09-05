import { Suspense, lazy, useEffect, useState } from 'react'
import type { Doors, Lights, Windows } from '@cybersan/protocol'
import { XTrail } from './XTrail'
// three.js is by far the heaviest thing the HUD loads. Splitting it out keeps
// the first paint on the Pi as quick as it was, with the flat car standing in
// for the fraction of a second the model needs to arrive.
const XTrail3D = lazy(() => import('./XTrail3D').then((m) => ({ default: m.XTrail3D })))
import './CarView.css'

/**
 * Manifest for a rendered car, if one has been dropped into public/car/.
 * See public/car/README.md — the images are layers straight out of Blender.
 */
interface CarManifest {
  base: string
  lights?: string
  doors?: Partial<Record<keyof Doors, string>>
}

/**
 * Shows the car: pre-rendered layers if any were dropped into public/car/, the
 * built-in 3D model otherwise, and the flat drawing where there is no WebGL.
 *
 * The state logic lives here once, so swapping the artwork — for renders of a
 * bought model, say — is a matter of adding files. No component, pane or layout
 * has to know which of the three is on screen.
 */
export function CarView({
  running,
  doors,
  windows,
  lights,
  reverse,
}: {
  running: boolean
  doors: Doors
  windows: Windows
  lights: Lights
  reverse: boolean
}): JSX.Element {
  const [manifest, setManifest] = useState<CarManifest | null>(null)
  const [noWebgl, setNoWebgl] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('car/manifest.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CarManifest | null) => {
        if (alive && data?.base) setManifest(data)
      })
      .catch(() => {
        // No renders installed; the model below is the intended default.
      })
    return () => {
      alive = false
    }
  }, [])

  if (!manifest) {
    // The model is the intended picture; the flat drawing is what is left when
    // the panel has no working GL — old kiosk images, a software renderer that
    // gave up, a browser started without acceleration.
    if (noWebgl) return <XTrail running={running} doors={doors} lights={lights} />
    return (
      <Suspense fallback={<XTrail running={running} doors={doors} lights={lights} />}>
        <XTrail3D
          running={running}
          doors={doors}
          windows={windows}
          lights={lights}
          reverse={reverse}
          onUnavailable={() => setNoWebgl(true)}
        />
      </Suspense>
    )
  }

  const beam = lights.lowBeam || lights.highBeam

  return (
    <div className="carview">
      <img className="carview__layer" src={`car/${manifest.base}`} alt="Nissan X-Trail T30" />
      {manifest.lights && (
        <img
          className={`carview__layer carview__layer--fade ${beam ? 'is-on' : ''}`}
          src={`car/${manifest.lights}`}
          alt=""
        />
      )}
      {Object.entries(manifest.doors ?? {}).map(([door, file]) => (
        <img
          key={door}
          className={`carview__layer carview__layer--fade ${doors[door as keyof Doors] ? 'is-on' : ''}`}
          src={`car/${file}`}
          alt=""
        />
      ))}
    </div>
  )
}

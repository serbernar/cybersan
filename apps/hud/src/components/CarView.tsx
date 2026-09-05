import { useEffect, useState } from 'react'
import type { Doors, Lights } from '@cybersan/protocol'
import { XTrail } from './XTrail'
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
 * Shows the car, from rendered layers when they exist and from the built-in
 * drawing when they do not.
 *
 * The state logic lives here once, so replacing the artwork with renders of a
 * properly licensed 3D model is a matter of adding files — no component, pane
 * or layout has to know which of the two is on screen.
 */
export function CarView({
  running,
  doors,
  lights,
}: {
  running: boolean
  doors: Doors
  lights: Lights
}): JSX.Element {
  const [manifest, setManifest] = useState<CarManifest | null>(null)

  useEffect(() => {
    let alive = true
    fetch('car/manifest.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: CarManifest | null) => {
        if (alive && data?.base) setManifest(data)
      })
      .catch(() => {
        // No renders installed; the drawing below is the intended fallback.
      })
    return () => {
      alive = false
    }
  }, [])

  if (!manifest) {
    return <XTrail running={running} doors={doors} lights={lights} />
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

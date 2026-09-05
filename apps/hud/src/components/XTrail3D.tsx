import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Doors, Lights, Windows } from '@cybersan/protocol'
import { buildT30, type CarColors, type CarModel, type LampState } from './car/t30'
import { loadCar, type ModelConfig } from './car/gltf'
import './XTrail3D.css'

interface Props {
  running: boolean
  doors: Doors
  windows: Windows
  lights: Lights
  /** In reverse. The one lamp no switch on the dashboard controls. */
  reverse?: boolean
  /** Let a pointer turn the car. Off in the car: nothing there wants dragging. */
  orbit?: boolean
  /** Turn the car by itself, for looking at it rather than driving. */
  spin?: boolean
  /** Called once if WebGL is unavailable, so the flat drawing can take over. */
  onUnavailable?: () => void
}

/** The car's palette lives in the theme, not in the model. */
function readColors(root: HTMLElement): CarColors {
  const css = getComputedStyle(root)
  const pick = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback
  return {
    paint: pick('--car-paint-1', '#4a5260'),
    paintDark: pick('--car-paint-4', '#171b22'),
    glass: pick('--car-glass-2', '#171d25'),
    wire: pick('--car-gap', '#0d1015'),
    clad: pick('--car-cladding', '#10141a'),
    tyre: pick('--car-tyre', '#0a0d11'),
    rim: pick('--car-rim', '#2b323c'),
    spoke: pick('--car-spoke', '#3f4855'),
    hub: pick('--car-hub', '#1b2028'),
    lamp: pick('--car-handle', '#59626f'),
    lampRear: pick('--car-lamp-rear', '#3a2b2e'),
    rail: pick('--car-rail', '#4d5563'),
    trim: pick('--car-trim', '#2b323c'),
    shadow: pick('--car-shadow', '#000000'),
    alert: pick('--crit', '#ff453a'),
  }
}

/** A soft blob under the car: cheaper than a shadow map and steadier to look at. */
function groundShadow(color: string): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)')
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 3.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, color, depthWrite: false }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.004
  return mesh
}

/**
 * A downloaded car, if one was dropped into public/car/. `model.json` is
 * optional: a bare `model.glb` is loaded with the defaults.
 */
async function findModel(): Promise<ModelConfig | null> {
  try {
    const response = await fetch('car/model.json')
    if (response.ok) return (await response.json()) as ModelConfig
  } catch {
    // No config; fall through to looking for the file itself.
  }
  try {
    const probe = await fetch('car/model.glb', { method: 'HEAD' })
    if (probe.ok) return { file: 'model.glb' }
  } catch {
    // Nothing installed. The built-in model is the default, not a fallback.
  }
  return null
}

/** The box the car has to fit inside, in metres: it is 4.45 long and 1.7 tall,
    seen at an angle, plus a margin so nothing touches the edge. */
const FRAME_WIDTH = 5.2
const FRAME_HEIGHT = 2.1

/**
 * The T30 as an actual model: lofted body, glass, wheels and lamps, lit from
 * above and drawn only when something changes. Frames are not free in a car,
 * so nothing spins on its own — the view is fixed and the state moves.
 */
/** Half a blink. Real flasher relays sit around 1.5 Hz. */
const BLINK_MS = 340

/**
 * The contract's switches, turned into what the lamps show this instant.
 * `on` is the blink phase; everything else is steady.
 */
function lampsFor(lights: Lights, reverse: boolean, on: boolean): LampState {
  const turning = lights.hazard ? 'both' : lights.turnLeft ? 'left' : lights.turnRight ? 'right' : 'none'
  return {
    beam: lights.highBeam ? 'high' : lights.lowBeam ? 'low' : 'off',
    fog: lights.fog,
    parking: lights.parking,
    brake: lights.brake,
    reverse,
    indicators: on ? turning : 'none',
  }
}

/**
 * Where the camera sits, as angles. Three-quarter from the front left: the
 * flank on screen is the driver's own, because an open driver's door is worth
 * nothing if it lights up on the side facing away. The nose points left, which
 * is what a camera on the -Z side gives.
 */
const VIEW = { radius: 7.74, azimuth: -0.822, elevation: 0.162, targetY: 0.9 }

export function XTrail3D({
  running,
  doors,
  windows,
  lights,
  reverse = false,
  orbit = false,
  spin = false,
  onUnavailable,
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<CarModel | null>(null)
  const drawRef = useRef<() => void>(() => {})
  const stateRef = useRef({ running, doors, windows, lights, reverse })
  stateRef.current = { running, doors, windows, lights, reverse }
  // Kept in a ref, not in the effect's dependencies: the parent hands us a new
  // callback on every render, and rebuilding a WebGL scene per frame is exactly
  // as bad as it sounds.
  const failRef = useRef(onUnavailable)
  failRef.current = onUnavailable
  const viewRef = useRef({ azimuth: VIEW.azimuth, elevation: VIEW.elevation })
  const blinkRef = useRef(true)
  // `start` is filled in by the effect below: the spin loop lives with the
  // renderer, but the prop that turns it on does not.
  const spinRef = useRef<{ on: boolean; start?: () => void }>({ on: spin })
  spinRef.current.on = spin
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    } catch {
      setFailed(true)
      failRef.current?.()
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40)
    let carBounds: THREE.Box3 | null = null
    const corner = new THREE.Vector3()

    /**
     * Frames the car. The dashboard keeps a fixed frame so the car never
     * appears to resize on its own; a view that can be turned measures the car
     * from where the camera actually is, or it clips the roof off from above.
     */
    const frame = (): void => {
      const { clientWidth: w, clientHeight: h } = host
      if (w === 0 || h === 0) return
      let halfW = FRAME_WIDTH / 2
      let halfH = FRAME_HEIGHT / 2
      if (orbit && carBounds) {
        camera.updateMatrixWorld()
        let x = 0
        let y = 0
        for (const cx of [carBounds.min.x, carBounds.max.x]) {
          for (const cy of [carBounds.min.y, carBounds.max.y]) {
            for (const cz of [carBounds.min.z, carBounds.max.z]) {
              corner.set(cx, cy, cz).applyMatrix4(camera.matrixWorldInverse)
              x = Math.max(x, Math.abs(corner.x))
              y = Math.max(y, Math.abs(corner.y))
            }
          }
        }
        halfW = x * 1.08
        halfH = y * 1.08
      }
      const half = Math.max(halfW, halfH * (w / h))
      camera.left = -half
      camera.right = half
      camera.top = (half * h) / w
      camera.bottom = (-half * h) / w
      camera.updateProjectionMatrix()
    }

    const aim = (): void => {
      const { azimuth, elevation } = viewRef.current
      const flat = VIEW.radius * Math.cos(elevation)
      camera.position.set(flat * Math.cos(azimuth), VIEW.targetY + VIEW.radius * Math.sin(elevation), flat * Math.sin(azimuth))
      camera.lookAt(0, VIEW.targetY, 0)
      frame()
    }
    aim()

    const colors = readColors(document.documentElement)
    let model = buildT30(colors)
    modelRef.current = model
    scene.add(model.root)
    carBounds = new THREE.Box3().setFromObject(model.root)

    // A downloaded body takes over once it arrives; until then, and if none is
    // installed, the built-in T30 is what is on screen.
    let alive = true
    void findModel().then(async (config) => {
      if (!alive || !config) return
      try {
        const loaded = await loadCar(`car/${config.file}`, config, readColors(document.documentElement))
        if (!alive) {
          loaded.dispose()
          return
        }
        scene.remove(model.root)
        model.dispose()
        model = loaded
        modelRef.current = loaded
        scene.add(loaded.root)
        carBounds = new THREE.Box3().setFromObject(loaded.root)
        applyState()
        draw()
      } catch (error) {
        console.warn('car model failed to load, keeping the built-in one', error)
      }
    })

    const shadow = groundShadow(colors.shadow)
    scene.add(shadow)

    scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x0a0d11, 1.7))
    const key = new THREE.DirectionalLight(0xffffff, 3.0)
    key.position.set(3.5, 6, -4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaebbd0, 1.0)
    fill.position.set(-5, 2.5, 3)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 1.3)
    rim.position.set(-2, 1.5, -6)
    scene.add(rim)

    /** Pushes whatever the car is doing right now onto whichever model is up. */
    const applyState = (): void => {
      const { running, doors, windows, lights, reverse: inReverse } = stateRef.current
      const current = modelRef.current
      if (!current) return
      current.setLights(lampsFor(lights, inReverse, blinkRef.current))
      current.setRunning(running)
      current.setDoors(doors)
      current.setWindows(windows)
    }

    let queued = false
    const draw = (): void => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        aim()
        renderer.render(scene, camera)
      })
    }
    drawRef.current = draw

    // Dragging and spinning are the only things here that ask for a frame loop,
    // and both are off in the car.
    let spinning = 0
    const step = (): void => {
      if (!spinRef.current.on) {
        spinning = 0
        return
      }
      viewRef.current.azimuth += 0.006
      draw()
      spinning = requestAnimationFrame(step)
    }
    spinRef.current.start = () => {
      if (!spinning) spinning = requestAnimationFrame(step)
    }

    let dragging: number | null = null
    let last = { x: 0, y: 0 }
    const onDown = (event: PointerEvent): void => {
      if (!orbit) return
      dragging = event.pointerId
      last = { x: event.clientX, y: event.clientY }
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent): void => {
      if (dragging !== event.pointerId) return
      viewRef.current.azimuth -= (event.clientX - last.x) * 0.008
      viewRef.current.elevation = Math.min(1.2, Math.max(-0.15, viewRef.current.elevation + (event.clientY - last.y) * 0.005))
      last = { x: event.clientX, y: event.clientY }
      draw()
    }
    const onUp = (event: PointerEvent): void => {
      if (dragging !== event.pointerId) return
      dragging = null
      renderer.domElement.releasePointerCapture(event.pointerId)
    }
    if (orbit) {
      renderer.domElement.addEventListener('pointerdown', onDown)
      renderer.domElement.addEventListener('pointermove', onMove)
      renderer.domElement.addEventListener('pointerup', onUp)
      renderer.domElement.addEventListener('pointercancel', onUp)
    }

    const resize = (): void => {
      const { clientWidth: w, clientHeight: h } = host
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      frame()
      draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    // Day and night are different paint, not a filter over the same picture.
    const themeWatch = new MutationObserver(() => {
      const next = readColors(document.documentElement)
      model.setColors(next)
      ;(shadow.material as THREE.MeshBasicMaterial).color.set(next.shadow)
      draw()
    })
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      alive = false
      cancelAnimationFrame(spinning)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointercancel', onUp)
      observer.disconnect()
      themeWatch.disconnect()
      model.dispose()
      shadow.geometry.dispose()
      ;(shadow.material as THREE.MeshBasicMaterial).map?.dispose()
      ;(shadow.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.domElement.remove()
      modelRef.current = null
    }
    // Built once: the car is the same object for the life of the panel.
  }, [])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    model.setLights(lampsFor(lights, reverse, blinkRef.current))
    model.setRunning(running)
    model.setDoors(doors)
    model.setWindows(windows)
    drawRef.current()
  }, [running, doors, windows, lights, reverse])

  // The flasher only runs while something is flashing.
  const flashing = lights.hazard || lights.turnLeft || lights.turnRight
  useEffect(() => {
    if (!flashing) {
      blinkRef.current = true
      modelRef.current?.setLights(lampsFor(lights, reverse, true))
      drawRef.current()
      return
    }
    const timer = window.setInterval(() => {
      blinkRef.current = !blinkRef.current
      modelRef.current?.setLights(lampsFor(lights, reverse, blinkRef.current))
      drawRef.current()
    }, BLINK_MS)
    return () => window.clearInterval(timer)
  }, [flashing, lights, reverse])

  useEffect(() => {
    if (spin) spinRef.current.start?.()
    drawRef.current()
  }, [spin])

  return (
    <div
      ref={hostRef}
      className={`car3d ${failed ? 'is-failed' : ''} ${orbit ? 'is-orbit' : ''}`}
      aria-label="Nissan X-Trail T30"
      role="img"
    />
  )
}

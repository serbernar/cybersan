import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Windows } from '@cybersan/protocol'
import type { CarColors, CarModel, DoorName, LampState } from './t30'

/**
 * A bought or downloaded car, loaded from public/car/model.glb.
 *
 * Nothing here knows what the file contains: the model is measured, squared up
 * to the same metre-scale space the built-in T30 lives in, and repainted in the
 * HUD's colours. A model with sensibly named parts also gets working lamps and
 * doors; one without still shows up as the right car.
 */

/** What a part of the car is, as far as the HUD's palette is concerned. */
export type Role =
  | 'paint'
  | 'glass'
  | 'tyre'
  | 'rim'
  | 'trim'
  | 'clad'
  | 'headlamp'
  | 'foglamp'
  | 'indicator'
  | 'reverse'
  | 'taillamp'

export interface ModelConfig {
  file: string
  /**
   * Source material name to role. Models name their materials however their
   * author felt like, so the mapping is data, not code; anything left out is
   * guessed from the name.
   */
  materials?: Record<string, Role>
  /**
   * Nodes to drop. Models carry things this dashboard has no use for — a
   * number plate, a market-specific wing marker — and hiding is safer than
   * asking whoever exported it to change the file.
   */
  hide?: string[]
  /** Roles for single nodes, when a material is too coarse a handle — the fog
      lamps of this T30 are moulded out of the same black plastic as the
      bumper they sit in. Takes precedence over `materials`. */
  nodes?: Record<string, Role>
  /** Credit line for the licence. Shown in settings, never in the way. */
  credit?: string
  /** Degrees to turn the car about the vertical axis before fitting. */
  yaw?: number
  /** Metres, nose to tail. A T30 is 4.455 long. */
  length?: number
  /** Keep the model's own materials instead of repainting it with the theme. */
  keepMaterials?: boolean
  /**
   * Mirror the car across its length. Free models of a T30 tend to be the
   * Japanese right-hand-drive version; ours is left-hand drive, and a HUD that
   * shows the wheel on the wrong side is showing somebody else's car.
   */
  mirror?: boolean
}

const DEFAULT_LENGTH = 4.455

/** Lamp colours: the two the car owns regardless of the dashboard's theme. */
const AMBER = '#ff9f0a'
const RED = '#e01508'

const IS_GLASS = /glass|window|windscreen|windshield|screen/i
const IS_TYRE = /tyre|tire|rubber|wheel_?rubber/i
const IS_RIM = /rim|disc|disk|hub|alloy/i
const IS_LAMP = /lamp|light|head_?light|tail_?light|faro/i
const IS_CLAD = /bumper|plastic|cladding|black_?plastic|grill/i
const IS_TRIM = /chrome|trim|mirror|metal|steel/i

/** A guess for a material the config does not name, from how it is called. */
function guessRole(label: string): Role {
  if (IS_GLASS.test(label)) return 'glass'
  if (IS_TYRE.test(label)) return 'tyre'
  if (IS_RIM.test(label)) return 'rim'
  if (/turn|indicator|blinker|repeater/i.test(label)) return 'indicator'
  if (IS_LAMP.test(label)) return 'headlamp'
  if (IS_CLAD.test(label)) return 'clad'
  if (IS_TRIM.test(label)) return 'trim'
  return 'paint'
}

/** Which door a node is, from its name. Covers the usual naming habits. */
function doorOf(name: string): DoorName | null {
  const n = name.toLowerCase()
  if (!/door|puerta|tailgate|trunk|boot|hatch|liftgate/.test(n)) return null
  if (/tailgate|trunk|boot|hatch|liftgate/.test(n)) return 'tailgate'
  const rear = /rear|back|_r_|rl|rr|2$/.test(n)
  const left = /left|_l\b|fl|rl|_l_/.test(n)
  if (rear) return left ? 'rearLeft' : 'rearRight'
  return left ? 'driver' : 'passenger'
}

/**
 * Doors, found by shape when the model does not name them: a door is a panel
 * on the flank, thin, tall, about a quarter of the car long and between the
 * axles. The tailgate is the wide thin panel across the very back.
 */
function inferDoors(meshes: THREE.Mesh[], bounds: THREE.Box3): Map<DoorName, THREE.Mesh[]> {
  const span = bounds.getSize(new THREE.Vector3())
  const found = new Map<DoorName, THREE.Mesh[]>()
  const push = (name: DoorName, mesh: THREE.Mesh): void => {
    const list = found.get(name) ?? []
    list.push(mesh)
    found.set(name, list)
  }
  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  const at = new THREE.Vector3()
  for (const mesh of meshes) {
    box.setFromObject(mesh)
    box.getSize(size)
    box.getCenter(at)
    const onFlank = Math.abs(at.z) > span.z * 0.35 && size.z < span.x * 0.045
    const doorSized = size.y > span.y * 0.25 && size.x > span.x * 0.15 && size.x < span.x * 0.32
    if (onFlank && doorSized && Math.abs(at.x) < span.x * 0.3) {
      const front = at.x > -span.x * 0.03
      // Right is forward × up: for a car facing +X, that puts left at -Z.
      const left = at.z < 0
      push(front ? (left ? 'driver' : 'passenger') : left ? 'rearLeft' : 'rearRight', mesh)
    } else if (
      size.x < span.x * 0.08 &&
      size.z > span.z * 0.4 &&
      size.y > span.y * 0.2 &&
      at.x < bounds.min.x + span.x * 0.12
    ) {
      push('tailgate', mesh)
    }
  }
  return found
}

/**
 * Door glass: the glazed panel that lives within a door's own footprint. A
 * quarter light bolted to the body sits outside every door and stays put, which
 * is exactly what it does on the car.
 */
function windowsOfDoors(
  glazed: THREE.Mesh[],
  doors: Map<DoorName, THREE.Mesh[]>,
  bounds: THREE.Box3,
): Map<keyof Windows, THREE.Mesh[]> {
  const span = bounds.getSize(new THREE.Vector3())
  const found = new Map<keyof Windows, THREE.Mesh[]>()
  const frames = new Map<keyof Windows, THREE.Box3>()
  for (const [name, panels] of doors) {
    if (name === 'tailgate') continue
    const frame = new THREE.Box3()
    for (const panel of panels) frame.union(new THREE.Box3().setFromObject(panel))
    frames.set(name as keyof Windows, frame)
  }
  const box = new THREE.Box3()
  const at = new THREE.Vector3()
  for (const mesh of glazed) {
    box.setFromObject(mesh)
    box.getCenter(at)
    if (Math.abs(at.z) < span.z * 0.3) continue
    for (const [name, frame] of frames) {
      const sameSide = at.z < 0 === frame.getCenter(new THREE.Vector3()).z < 0
      const inside = box.min.x > frame.min.x - 0.06 && box.max.x < frame.max.x + 0.06
      if (!sameSide || !inside) continue
      const list = found.get(name) ?? []
      list.push(mesh)
      found.set(name, list)
      break
    }
  }
  return found
}

/** Reverses triangle winding, which a mirror turns inside out. */
function flipWinding(geom: THREE.BufferGeometry): void {
  const index = geom.getIndex()
  if (index) {
    const array = index.array as Uint32Array | Uint16Array
    for (let i = 0; i < array.length; i += 3) {
      const swap = array[i + 1]
      array[i + 1] = array[i + 2]
      array[i + 2] = swap
    }
    index.needsUpdate = true
    return
  }
  for (const name of Object.keys(geom.attributes)) {
    const attribute = geom.getAttribute(name)
    const size = attribute.itemSize
    const array = attribute.array as Float32Array
    for (let i = 0; i < attribute.count; i += 3) {
      for (let k = 0; k < size; k += 1) {
        const a = (i + 1) * size + k
        const b = (i + 2) * size + k
        const swap = array[a]
        array[a] = array[b]
        array[b] = swap
      }
    }
    attribute.needsUpdate = true
  }
}

/**
 * Bakes the whole hierarchy into world space: every mesh keeps its geometry in
 * metres, at the origin, with no transform of its own.
 *
 * Exported models nest meshes under a stack of matrices — this one comes from
 * 3ds, so the local axes are not the car's axes and local units are not metres.
 * Flattening once here is what lets everything below work in plain world terms:
 * a window drops along Y, a door is measured in metres, and mirroring the car
 * is one matrix rather than a fight with parent transforms.
 */
function flatten(model: THREE.Object3D, mirror: boolean): THREE.Group {
  model.updateMatrixWorld(true)
  const flat = new THREE.Group()
  const seen = new Set<THREE.BufferGeometry>()
  const mirrorMatrix = new THREE.Matrix4().makeScale(1, 1, -1)
  const source: THREE.Mesh[] = []
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) source.push(node)
  })
  for (const mesh of source) {
    let geom = mesh.geometry as THREE.BufferGeometry
    // Shared geometry has to be copied before it is moved, or one instance
    // drags the others with it.
    if (seen.has(geom)) geom = geom.clone()
    seen.add(geom)
    geom.applyMatrix4(mesh.matrixWorld)
    if (mirror) {
      // applyMatrix4 flips the normals for us; the winding it cannot know about.
      geom.applyMatrix4(mirrorMatrix)
      flipWinding(geom)
    }
    const copy = new THREE.Mesh(geom, mesh.material)
    copy.name = mesh.name
    copy.userData = { ...mesh.userData }
    copy.castShadow = false
    copy.receiveShadow = false
    flat.add(copy)
  }
  return flat
}

export async function loadCar(url: string, config: ModelConfig, colors: CarColors): Promise<CarModel> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const loaded = gltf.scene

  // Square it up: turn as configured, lay the length along X, stand it on the
  // ground and scale it to real metres.
  loaded.rotation.y = THREE.MathUtils.degToRad(config.yaw ?? 0)
  loaded.updateMatrixWorld(true)
  let box = new THREE.Box3().setFromObject(loaded)
  let size = box.getSize(new THREE.Vector3())
  if (size.z > size.x) {
    loaded.rotation.y += Math.PI / 2
    loaded.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(loaded)
    size = box.getSize(new THREE.Vector3())
  }
  const scale = (config.length ?? DEFAULT_LENGTH) / size.x
  loaded.scale.setScalar(scale)
  loaded.updateMatrixWorld(true)
  box = new THREE.Box3().setFromObject(loaded)
  const centre = box.getCenter(new THREE.Vector3())
  loaded.position.x -= centre.x
  loaded.position.z -= centre.z
  loaded.position.y -= box.min.y

  const model = flatten(loaded, config.mirror ?? false)

  const root = new THREE.Group()
  root.add(model)

  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  const paint = track(new THREE.MeshStandardMaterial({ color: colors.paint, metalness: 0.35, roughness: 0.5 }))
  const glass = track(new THREE.MeshStandardMaterial({ color: colors.glass, metalness: 0.5, roughness: 0.18 }))
  const tyre = track(new THREE.MeshStandardMaterial({ color: colors.tyre, metalness: 0.05, roughness: 0.95 }))
  const rim = track(new THREE.MeshStandardMaterial({ color: colors.rim, metalness: 0.6, roughness: 0.35 }))
  const trim = track(new THREE.MeshStandardMaterial({ color: colors.trim, metalness: 0.25, roughness: 0.6 }))
  const clad = track(new THREE.MeshStandardMaterial({ color: colors.clad, metalness: 0.05, roughness: 0.9 }))
  const lampFront = track(
    new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.25, emissive: new THREE.Color('#fff6dd'), emissiveIntensity: 0 }),
  )
  const lampFog = track(
    new THREE.MeshStandardMaterial({ color: colors.clad, roughness: 0.3, emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0 }),
  )
  // One material per side, so a single indicator can blink on its own.
  const lampReverse = track(
    new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.25, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }),
  )
  const lampTurn = {
    left: track(new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.3, emissive: new THREE.Color(AMBER), emissiveIntensity: 0 })),
    right: track(new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.3, emissive: new THREE.Color(AMBER), emissiveIntensity: 0 })),
  }
  const lampRear = track(
    new THREE.MeshStandardMaterial({ color: colors.lampRear, roughness: 0.3, emissive: new THREE.Color(RED), emissiveIntensity: 0 }),
  )
  const edgeMat = track(new THREE.LineBasicMaterial({ color: colors.wire, transparent: true, opacity: 0.45 }))
  const alertMat = track(
    new THREE.MeshBasicMaterial({ color: colors.alert, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
  )

  const doorNodes = new Map<DoorName, THREE.Mesh[]>()
  const glazed: THREE.Mesh[] = []
  let alertColor = colors.alert

  const hidden = new Set(config.hide ?? [])
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    if (hidden.has(node.name)) {
      node.visible = false
      return
    }
    node.castShadow = false
    node.receiveShadow = false
    const source = Array.isArray(node.material) ? '' : ((node.material as THREE.Material)?.name ?? '')
    node.userData.source = source
    const label = `${node.name} ${source}`
    const door = doorOf(node.name) ?? doorOf(node.parent?.name ?? '')
    if (door) {
      const list = doorNodes.get(door) ?? []
      list.push(node)
      doorNodes.set(door, list)
    }
    if (config.keepMaterials) return

    // Repaint: the HUD is one palette, and a bright red car in the corner of a
    // night dashboard is a lamp, not a picture.
    const role = config.nodes?.[node.name] ?? config.materials?.[source] ?? guessRole(label)
    const byRole: Record<Role, THREE.MeshStandardMaterial> = {
      paint,
      glass,
      tyre,
      rim,
      trim,
      clad,
      headlamp: lampFront,
      foglamp: lampFog,
      indicator: lampTurn.right,
      reverse: lampReverse,
      taillamp: lampRear,
    }
    let next = byRole[role] ?? paint
    if (role === 'indicator') {
      const at = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())
      next = at.z < 0 ? lampTurn.left : lampTurn.right
    }
    if (role === 'glass') glazed.push(node)
    // A door has to be able to light up on its own, so it gets its own copy of
    // the material rather than sharing the body's.
    node.material = door ? track(next.clone()) : next
  })

  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__car = model

  // Panel lines: only the creases, not every triangle. A downloaded body is far
  // denser than the built-in one, and a full wireframe would bury it.
  const bodies: THREE.Mesh[] = []
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) bodies.push(node)
  })
  for (const node of bodies) {
    const geom = node.geometry as THREE.BufferGeometry
    if ((geom.getAttribute('position')?.count ?? 0) > 40000) continue
    node.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(geom, 32)), edgeMat))
  }

  const bounds = new THREE.Box3().setFromObject(model)
  if (doorNodes.size === 0) {
    for (const [name, meshes] of inferDoors(bodies, bounds)) {
      doorNodes.set(name, meshes)
      // Same reason as above: a panel that lights up needs its own material.
      for (const mesh of meshes) mesh.material = track((mesh.material as THREE.MeshStandardMaterial).clone())
    }
  }

  // Windows drop straight down, in metres, because the hierarchy was flattened
  // above: a glass mesh's own transform is the identity, so its Y is the car's.
  const windowGlass = new Map<keyof Windows, Array<{ mesh: THREE.Mesh; drop: number }>>()
  for (const [name, meshes] of windowsOfDoors(glazed, doorNodes, bounds)) {
    windowGlass.set(
      name,
      meshes.map((mesh) => {
        const glassBox = new THREE.Box3().setFromObject(mesh)
        return { mesh, drop: (glassBox.max.y - glassBox.min.y) * 0.94 }
      }),
    )
  }

  // Whatever is still unaccounted for gets a wash over the part of the body
  // where that door would be. Better a rectangle than a silent door.
  const washes = new Map<DoorName, THREE.Mesh>()
  const span = bounds.getSize(new THREE.Vector3())
  // Mirrors stick out past the body, so the width they report is not the width
  // a panel sits at. Everything below works off the flank, not the bounds.
  const flankZ = bounds.max.z * 0.86
  // The tailgate has no entry: it faces away from the camera, so a rectangle
  // pasted over it would only ever show as an edge sticking past the body. An
  // open boot is called out in words under the car instead.
  const WASH: Partial<Record<DoorName, [number, number, boolean]>> = {
    driver: [0.085, -1, true],
    passenger: [0.085, 1, true],
    rearLeft: [-0.125, -1, true],
    rearRight: [-0.125, 1, true],
  }
  for (const [name, [along, side, flank]] of Object.entries(WASH) as Array<[DoorName, [number, number, boolean]]>) {
    if (doorNodes.has(name)) continue
    const geom = track(new THREE.PlaneGeometry(span.x * 0.2, span.y * 0.32))
    const mesh = new THREE.Mesh(geom, alertMat)
    if (flank) {
      // Just off the flank, not off the mirrors: the bounds include them.
      mesh.position.set(span.x * along, bounds.min.y + span.y * 0.5, side * (flankZ + 0.01))
      mesh.rotation.y = side > 0 ? 0 : Math.PI
    } else {
      mesh.position.set(bounds.min.x + span.x * 0.045, bounds.min.y + span.y * 0.64, 0)
      mesh.rotation.y = -Math.PI / 2
    }
    mesh.visible = false
    root.add(mesh)
    washes.set(name, mesh)
  }

  return {
    root,
    setColors(next: CarColors): void {
      paint.color.set(next.paint)
      glass.color.set(next.glass)
      tyre.color.set(next.tyre)
      rim.color.set(next.rim)
      trim.color.set(next.trim)
      clad.color.set(next.clad)
      lampFront.color.set(next.lamp)
      lampFog.color.set(next.clad)
      lampReverse.color.set(next.lamp)
      lampTurn.left.color.set(next.lamp)
      lampTurn.right.color.set(next.lamp)
      lampRear.color.set(next.lampRear)
      edgeMat.color.set(next.wire)
      alertMat.color.set(next.alert)
      alertColor = next.alert
    },
    setLights({ beam, fog, parking, brake, reverse, indicators }: LampState): void {
      const lit = beam !== 'off'
      lampReverse.emissiveIntensity = reverse ? 2.2 : 0
      lampFront.emissiveIntensity = beam === 'high' ? 2.6 : beam === 'low' ? 1.5 : parking ? 0.3 : 0
      lampFog.emissiveIntensity = fog ? 1.5 : 0
      // Stop lamps are the same bulbs as the tail lamps, only much brighter.
      // Past about 1.3 the red clips to salmon under this tone mapping.
      lampRear.emissiveIntensity = brake ? 1.25 : parking || lit ? 0.32 : 0
      for (const side of ['left', 'right'] as const) {
        lampTurn[side].emissiveIntensity = indicators === 'both' || indicators === side ? 2.4 : 0
      }
    },
    setDoors(doors: Partial<Record<DoorName, boolean>>): void {
      for (const [name, mesh] of washes) mesh.visible = Boolean(doors[name])
      for (const [name, nodes] of doorNodes) {
        const open = Boolean(doors[name])
        for (const node of nodes) {
          const material = node.material as THREE.MeshStandardMaterial
          if (!material?.emissive) continue
          material.emissive.set(open ? alertColor : '#000000')
          material.emissiveIntensity = open ? 0.6 : 0
        }
      }
    },
    setWindows(windows: Partial<Windows>): void {
      for (const [name, glass] of windowGlass) {
        const open = Math.min(100, Math.max(0, windows[name] ?? 0)) / 100
        for (const { mesh, drop } of glass) mesh.position.y = -drop * open
      }
    },
    setRunning(): void {
      // Nothing to do: a loaded model has its own surfacing.
    },
    dispose(): void {
      for (const item of disposables) item.dispose()
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose()
      })
    },
  }
}

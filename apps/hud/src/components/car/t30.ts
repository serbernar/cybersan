import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Windows } from '@cybersan/protocol'

/**
 * The T30 as geometry rather than as a drawing.
 *
 * The body is lofted through a handful of measured cross-sections: length runs
 * along +X (nose forward), height along +Y, width along Z. Everything else —
 * bumpers, lamps, rails, wheels — hangs off the same numbers, so moving a
 * station moves the parts that sit on it.
 */

export interface CarColors {
  paint: string
  paintDark: string
  glass: string
  wire: string
  clad: string
  tyre: string
  rim: string
  spoke: string
  hub: string
  lamp: string
  lampRear: string
  rail: string
  trim: string
  shadow: string
  alert: string
}

export type DoorName = 'driver' | 'passenger' | 'rearLeft' | 'rearRight' | 'tailgate'

interface Station {
  x: number
  /** Bottom edge of the side panel: low at the sills, high over the arches. */
  archY: number
  beltY: number
  roofY: number
  sillHW: number
  bodyHW: number
  beltHW: number
  roofHW: number
}

/** Indicator amber, the one colour on the car that is never themed. */
const AMBER = '#ff9f0a'
const RED = '#e01508'

/** Underbody plane. Flat, and high enough to stay out of sight. */
const UNDER_Y = 0.3

/** Real T30: 4455 long, 1765 wide, 1675 tall, 2625 between the axles. */
const AXLE_X = 1.31
const WHEEL_R = 0.36
const WHEEL_Z = 0.755

const STATIONS: Station[] = [
  { x: -2.22, archY: 0.62, beltY: 0.95, roofY: 1.0, sillHW: 0.58, bodyHW: 0.68, beltHW: 0.66, roofHW: 0.58 },
  { x: -2.12, archY: 0.48, beltY: 1.0, roofY: 1.06, sillHW: 0.74, bodyHW: 0.84, beltHW: 0.82, roofHW: 0.74 },
  { x: -2.0, archY: 0.44, beltY: 1.02, roofY: 1.22, sillHW: 0.79, bodyHW: 0.865, beltHW: 0.855, roofHW: 0.78 },
  { x: -1.9, archY: 0.43, beltY: 1.02, roofY: 1.45, sillHW: 0.8, bodyHW: 0.87, beltHW: 0.86, roofHW: 0.8 },
  { x: -1.78, archY: 0.44, beltY: 1.02, roofY: 1.62, sillHW: 0.805, bodyHW: 0.872, beltHW: 0.862, roofHW: 0.81 },
  { x: -1.62, archY: 0.55, beltY: 1.02, roofY: 1.68, sillHW: 0.81, bodyHW: 0.875, beltHW: 0.865, roofHW: 0.81 },
  { x: -1.31, archY: 0.84, beltY: 1.02, roofY: 1.7, sillHW: 0.815, bodyHW: 0.878, beltHW: 0.868, roofHW: 0.815 },
  { x: -1.0, archY: 0.52, beltY: 1.02, roofY: 1.71, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.82 },
  { x: -0.4, archY: 0.38, beltY: 1.02, roofY: 1.71, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.82 },
  { x: 0.2, archY: 0.38, beltY: 1.02, roofY: 1.7, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.82 },
  { x: 0.68, archY: 0.4, beltY: 1.02, roofY: 1.66, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.8 },
  { x: 0.95, archY: 0.44, beltY: 1.03, roofY: 1.4, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.8 },
  { x: 1.15, archY: 0.5, beltY: 1.04, roofY: 1.1, sillHW: 0.82, bodyHW: 0.88, beltHW: 0.87, roofHW: 0.84 },
  { x: 1.31, archY: 0.84, beltY: 1.02, roofY: 1.09, sillHW: 0.815, bodyHW: 0.878, beltHW: 0.868, roofHW: 0.84 },
  { x: 1.6, archY: 0.52, beltY: 1.0, roofY: 1.08, sillHW: 0.81, bodyHW: 0.875, beltHW: 0.865, roofHW: 0.83 },
  { x: 1.85, archY: 0.46, beltY: 0.98, roofY: 1.05, sillHW: 0.79, bodyHW: 0.865, beltHW: 0.855, roofHW: 0.82 },
  { x: 2.03, archY: 0.5, beltY: 0.92, roofY: 0.99, sillHW: 0.75, bodyHW: 0.83, beltHW: 0.82, roofHW: 0.79 },
  { x: 2.14, archY: 0.62, beltY: 0.84, roofY: 0.9, sillHW: 0.6, bodyHW: 0.68, beltHW: 0.67, roofHW: 0.62 },
]

const NOSE = STATIONS[STATIONS.length - 1].x
const TAIL = STATIONS[0].x

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

const FIELDS = ['archY', 'beltY', 'roofY', 'sillHW', 'bodyHW', 'beltHW', 'roofHW'] as const

/** The body between the stations, so the arches and the windscreen curve. */
function stationAt(x: number): Station {
  const clamped = Math.min(NOSE, Math.max(TAIL, x))
  let i = 0
  while (i < STATIONS.length - 2 && STATIONS[i + 1].x < clamped) i += 1
  const a = STATIONS[Math.max(0, i - 1)]
  const b = STATIONS[i]
  const c = STATIONS[i + 1]
  const d = STATIONS[Math.min(STATIONS.length - 1, i + 2)]
  const t = (clamped - b.x) / (c.x - b.x)
  const out = { x: clamped } as Station
  for (const key of FIELDS) out[key] = catmull(a[key], b[key], c[key], d[key], t)
  return out
}

type P2 = [number, number]

/** Sill to belt: the painted flank, plus the underbody that closes it off.
    A T30 is slab-sided — the flank is all but vertical, and the radii sit in a
    tight band at the shoulder and at the sill. */
function lowerLoop(s: Station): P2[] {
  const span = s.beltY - s.archY
  const side = (k: number): P2[] => [
    [s.beltY, k * s.beltHW],
    [s.beltY - span * 0.1, k * s.bodyHW],
    [s.beltY - span * 0.45, k * s.bodyHW],
    [s.beltY - span * 0.82, k * s.sillHW],
    [Math.min(s.archY + 0.02, UNDER_Y + 0.02), k * s.sillHW * 0.97],
    [Math.min(s.archY, UNDER_Y), k * s.sillHW * 0.55],
  ]
  return [...side(1), [Math.min(s.archY, UNDER_Y), 0], ...side(-1).reverse()]
}

/** Belt to roof: an upright glasshouse with a flat roof and a small corner
    radius, which is what makes the T30 look tall rather than melted. */
function upperLoop(s: Station): P2[] {
  const span = s.roofY - s.beltY
  const side = (k: number): P2[] => [
    [s.beltY, k * s.beltHW],
    [s.beltY + span * 0.55, k * (s.beltHW * 0.35 + s.roofHW * 0.65)],
    [Math.max(s.beltY, s.roofY - 0.06), k * s.roofHW],
    [s.roofY, k * s.roofHW * 0.93],
  ]
  return [...side(1), [s.roofY, 0], ...side(-1).reverse()]
}

/** Where the greenhouse turns from paint into glass, along the length. */
type Band = [number, number, 'paint' | 'glass']

const ROOF_BANDS: Band[] = [
  [2.14, 1.15, 'paint'],
  [1.15, 0.68, 'glass'],
  [0.68, -1.55, 'paint'],
  [-1.55, -1.94, 'glass'],
  [-1.94, -2.22, 'paint'],
]

/** The flank, cut at every pillar: A, B, C and the thick D behind the quarter
    glass. Reading the pillars is most of what tells one car from another. */
const SIDE_BANDS: Band[] = [
  [2.14, 1.06, 'paint'],
  [1.06, -0.02, 'glass'],
  [-0.02, -0.12, 'paint'],
  [-0.12, -1.16, 'glass'],
  [-1.16, -1.3, 'paint'],
  [-1.3, -1.72, 'glass'],
  [-1.72, -2.22, 'paint'],
]

/** Belt height, where the door glass disappears into the door. */
const BELT_Y = 1.02

/** Which side bands are door windows, keyed by where the band starts. */
const WINDOW_OF = new Map<number, 'front' | 'rear'>([
  [1.06, 'front'],
  [-0.12, 'rear'],
])

/**
 * Which side of a section is which. Right is forward × up, so a car facing +X
 * with +Y up has its right side at +Z and its left — the driver's, here — at
 * -Z. Get this backwards and every door, window and indicator lands on the
 * wrong flank, which is easy to miss because the car looks symmetrical.
 */
const GLASS_Z_POS: [number, number] = [0, 2]
const GLASS_Z_NEG: [number, number] = [6, 8]
const ROOF_RANGE: [number, number] = [2, 6]

/** Winding follows from the section order, so fix it by measurement instead. */
function orient(geom: THREE.BufferGeometry, center: THREE.Vector3): THREE.BufferGeometry {
  const pos = geom.getAttribute('position')
  const index = geom.getIndex()
  if (!index) return geom
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const m = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  let score = 0
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i))
    b.fromBufferAttribute(pos, index.getX(i + 1))
    c.fromBufferAttribute(pos, index.getX(i + 2))
    n.copy(e1.copy(b).sub(a)).cross(e2.copy(c).sub(a))
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center)
    score += n.dot(m)
  }
  if (score < 0) {
    const array = index.array as Uint32Array | Uint16Array
    for (let i = 0; i < array.length; i += 3) {
      const swap = array[i + 1]
      array[i + 1] = array[i + 2]
      array[i + 2] = swap
    }
    index.needsUpdate = true
  }
  geom.computeVertexNormals()
  return geom
}

const CENTER = new THREE.Vector3(0, 1, 0)

/**
 * Sweeps one strip of a section outline along the given stations.
 * `range` picks which part of the outline is on this strip, which is how the
 * same sections give a painted flank, a glass house and a roof.
 */
function loft(xs: number[], loop: (s: Station) => P2[], range?: [number, number]): THREE.BufferGeometry {
  const rows = xs.map((x) => {
    const pts = loop(stationAt(x))
    const [from, to] = range ?? [0, pts.length - 1]
    return { x, pts: pts.slice(from, to + 1) }
  })
  const cols = rows[0].pts.length
  const position: number[] = []
  for (const row of rows) for (const [y, z] of row.pts) position.push(row.x, y, z)
  const index: number[] = []
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let j = 0; j < cols - 1; j += 1) {
      const a = i * cols + j
      const b = a + 1
      const c = a + cols + 1
      const d = a + cols
      index.push(a, b, c, a, c, d)
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geom.setIndex(index)
  return orient(geom, CENTER)
}

/** Closes the nose and the tail with a fan across the whole section. */
function cap(x: number, flip: boolean): THREE.BufferGeometry {
  const s = stationAt(x)
  const upper = upperLoop(s)
  const lower = lowerLoop(s)
  const ring = [...upper, ...lower.slice(1, lower.length - 1).reverse()]
  const position: number[] = [x, s.beltY * 0.6 + s.roofY * 0.4, 0]
  for (const [y, z] of ring) position.push(x, y, z)
  const index: number[] = []
  for (let i = 0; i < ring.length; i += 1) {
    const next = ((i + 1) % ring.length) + 1
    index.push(0, i + 1, next)
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geom.setIndex(index)
  return orient(geom, new THREE.Vector3(flip ? x + 1 : x - 1, 1, 0))
}

function samples(from: number, to: number, step = 0.075): number[] {
  const count = Math.max(2, Math.ceil(Math.abs(to - from) / step))
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count)
}

function wheel(mats: { tyre: THREE.Material; rim: THREE.Material; spoke: THREE.Material; hub: THREE.Material }): THREE.Group {
  const group = new THREE.Group()
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.23, 22), mats.tyre)
  tyre.rotation.x = Math.PI / 2
  group.add(tyre)
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.205, 20), mats.rim)
  rim.rotation.x = Math.PI / 2
  group.add(rim)
  for (let i = 0; i < 5; i += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.03), mats.spoke)
    spoke.position.z = 0.105
    spoke.rotation.z = (i * Math.PI * 2) / 5
    spoke.position.x = Math.sin(spoke.rotation.z) * -0.115
    spoke.position.y = Math.cos(spoke.rotation.z) * 0.115
    group.add(spoke)
  }
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.028, 6, 20), mats.rim)
  lip.position.z = 0.1
  group.add(lip)
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), mats.hub)
  hub.rotation.x = Math.PI / 2
  group.add(hub)
  return group
}

/** Door cut lines, drawn on the flank where a T30 actually has them. */
const CUTS = [1.06, -0.02, -1.16]

const DOOR_SPANS: Record<Exclude<DoorName, 'tailgate'>, [number, number]> = {
  driver: [-0.05, 0.95],
  passenger: [-0.05, 0.95],
  rearLeft: [-1.1, -0.05],
  rearRight: [-1.1, -0.05],
}

/** Which flank each door is on. The driver sits on the left, which is -Z. */
const DOOR_SIDE: Record<Exclude<DoorName, 'tailgate'>, number> = {
  driver: -1,
  passenger: 1,
  rearLeft: -1,
  rearRight: 1,
}

/**
 * What is lit right now. Blinking is resolved before it gets here — the model
 * is told what to show this instant, not what rhythm to keep.
 */
export interface LampState {
  beam: 'off' | 'low' | 'high'
  fog: boolean
  /** Габарити: the tail lamps glow, but nowhere near stop-lamp bright. */
  parking: boolean
  brake: boolean
  /** Reverse gear: the white lamp at the back, and nothing else. */
  reverse: boolean
  indicators: 'none' | 'left' | 'right' | 'both'
}

export interface CarModel {
  root: THREE.Group
  setColors(colors: CarColors): void
  setLights(state: LampState): void
  setDoors(doors: Partial<Record<DoorName, boolean>>): void
  /** Window aperture in percent, the way the contract carries it. */
  setWindows(windows: Partial<Windows>): void
  setRunning(running: boolean): void
  dispose(): void
}

export function buildT30(colors: CarColors): CarModel {
  const root = new THREE.Group()
  const disposables: Array<{ dispose(): void }> = []
  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item)
    return item
  }

  const paint = track(new THREE.MeshStandardMaterial({ color: colors.paint, metalness: 0.35, roughness: 0.52 }))
  const glass = track(new THREE.MeshStandardMaterial({ color: colors.glass, metalness: 0.5, roughness: 0.18 }))
  const clad = track(new THREE.MeshStandardMaterial({ color: colors.clad, metalness: 0.1, roughness: 0.85 }))
  const trim = track(new THREE.MeshStandardMaterial({ color: colors.trim, metalness: 0.2, roughness: 0.6 }))
  const rail = track(new THREE.MeshStandardMaterial({ color: colors.rail, metalness: 0.3, roughness: 0.5 }))
  const tyreMat = track(new THREE.MeshStandardMaterial({ color: colors.tyre, metalness: 0.05, roughness: 0.95 }))
  const rimMat = track(new THREE.MeshStandardMaterial({ color: colors.rim, metalness: 0.6, roughness: 0.35 }))
  const spokeMat = track(new THREE.MeshStandardMaterial({ color: colors.spoke, metalness: 0.6, roughness: 0.35 }))
  const hubMat = track(new THREE.MeshStandardMaterial({ color: colors.hub, metalness: 0.5, roughness: 0.4 }))
  const lampMat = track(new THREE.MeshStandardMaterial({ color: colors.lamp, metalness: 0.2, roughness: 0.25, emissive: new THREE.Color('#fff6dd'), emissiveIntensity: 0 }))
  const fogMat = track(new THREE.MeshStandardMaterial({ color: colors.lamp, metalness: 0.2, roughness: 0.3, emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0 }))
  const reverseMat = track(new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.25, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }))
  const turnMat = {
    left: track(new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.3, emissive: new THREE.Color(AMBER), emissiveIntensity: 0 })),
    right: track(new THREE.MeshStandardMaterial({ color: colors.lamp, roughness: 0.3, emissive: new THREE.Color(AMBER), emissiveIntensity: 0 })),
  }
  const lampRearMat = track(new THREE.MeshStandardMaterial({ color: colors.lampRear, metalness: 0.2, roughness: 0.3, emissive: new THREE.Color(RED), emissiveIntensity: 0 }))
  const wireMat = track(new THREE.LineBasicMaterial({ color: colors.wire, transparent: true, opacity: 0.5 }))
  const cutMat = track(new THREE.LineBasicMaterial({ color: colors.wire, transparent: true, opacity: 0.75 }))
  const alertMat = track(
    new THREE.MeshBasicMaterial({
      color: colors.alert,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )

  const xs = samples(TAIL, NOSE)
  const shell = new THREE.Group()
  const skin: THREE.BufferGeometry[] = []

  const add = (geom: THREE.BufferGeometry, material: THREE.Material, wireframe = true): void => {
    track(geom)
    shell.add(new THREE.Mesh(geom, material))
    if (wireframe) skin.push(geom)
  }

  add(loft(xs, lowerLoop), paint)
  // The greenhouse is glass only where a T30 has glass: the same sweep, cut at
  // the cowl and at the D-pillar so the windscreen and the tailgate window are
  // dark and the bonnet and roof stay painted.
  for (const [from, to, kind] of ROOF_BANDS) {
    add(loft(samples(from, to), upperLoop, ROOF_RANGE), kind === 'glass' ? glass : paint)
  }
  const windowGroups = new Map<keyof Windows, THREE.Group[]>()
  for (const [from, to, kind] of SIDE_BANDS) {
    for (const range of [GLASS_Z_POS, GLASS_Z_NEG]) {
      const window = kind === 'glass' ? WINDOW_OF.get(from) : undefined
      if (!window) {
        add(loft(samples(from, to), upperLoop, range), kind === 'glass' ? glass : paint)
        continue
      }
      // A door window is its own mesh, hung on a group pinned to the belt line,
      // so opening it is a scale about the sill rather than a rebuild.
      const geom = track(loft(samples(from, to), upperLoop, range))
      geom.translate(0, -BELT_Y, 0)
      const group = new THREE.Group()
      group.position.y = BELT_Y
      group.add(new THREE.Mesh(geom, glass))
      shell.add(group)
      skin.push(geom)
      const side = range === GLASS_Z_POS ? 'passenger' : 'driver'
      const name = (window === 'front' ? side : side === 'driver' ? 'rearLeft' : 'rearRight') as keyof Windows
      const list = windowGroups.get(name) ?? []
      list.push(group)
      windowGroups.set(name, list)
    }
  }
  add(cap(NOSE, true), paint)
  add(cap(TAIL, false), paint)
  root.add(shell)

  // One line set over the whole shell: the model reads as a model, the way a
  // wireframe pass does, without a second material per panel.
  const wire = new THREE.Group()
  for (const geom of skin) {
    const lines = new THREE.LineSegments(track(new THREE.WireframeGeometry(geom)), wireMat)
    wire.add(lines)
  }
  root.add(wire)

  // Panel gaps: the flank sampled at each cut, from belt down to sill.
  const cutGroup = new THREE.Group()
  for (const cutX of CUTS) {
    const s = stationAt(cutX)
    const pts = lowerLoop(s)
    for (const k of [1, -1]) {
      const side = k > 0 ? pts.slice(0, 5) : pts.slice(pts.length - 5).reverse()
      const positions: number[] = []
      for (const [y, z] of side) positions.push(cutX, y, z * 1.006)
      const geom = track(new THREE.BufferGeometry())
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      cutGroup.add(new THREE.Line(geom, cutMat))
    }
  }
  for (const k of [1, -1]) {
    const edge: number[] = []
    for (const x of samples(1.16, 2.1, 0.06)) {
      const st = stationAt(x)
      const [y, z] = upperLoop(st)[2]
      edge.push(x, y + 0.004, z * k * 1.004)
    }
    const geom = track(new THREE.BufferGeometry())
    geom.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3))
    cutGroup.add(new THREE.Line(geom, cutMat))
  }
  root.add(cutGroup)

  // Bumpers and sill cladding — the grey plastic that makes a T30 a T30.
  const bumper = (x: number, width: number, hw: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(track(new RoundedBoxGeometry(width, 0.4, hw * 2, 3, 0.11)), clad)
    mesh.position.set(x, 0.5, 0)
    return mesh
  }
  root.add(bumper(1.98, 0.36, 0.79))
  root.add(bumper(-2.03, 0.34, 0.77))
  for (const k of [1, -1]) {
    const sill = new THREE.Mesh(track(new RoundedBoxGeometry(2.3, 0.16, 0.1, 2, 0.04)), clad)
    sill.position.set(0, 0.42, k * 0.79)
    root.add(sill)
    for (const x of [AXLE_X, -AXLE_X]) {
      const flare = new THREE.Mesh(track(new THREE.TorusGeometry(0.5, 0.075, 8, 20, Math.PI)), clad)
      flare.position.set(x, 0.34, k * 0.79)
      flare.scale.set(1, 0.98, 1)
      root.add(flare)
    }
  }

  // Grille and lamps.
  const grille = new THREE.Mesh(track(new RoundedBoxGeometry(0.08, 0.13, 0.5, 2, 0.03)), trim)
  grille.position.set(2.14, 0.86, 0)
  root.add(grille)
  const intake = new THREE.Mesh(track(new RoundedBoxGeometry(0.1, 0.16, 0.86, 2, 0.04)), trim)
  intake.position.set(2.13, 0.5, 0)
  root.add(intake)
  for (const k of [1, -1]) {
    const head = new THREE.Mesh(track(new RoundedBoxGeometry(0.24, 0.19, 0.62, 3, 0.05)), lampMat)
    head.position.set(1.99, 0.85, k * 0.47)
    head.rotation.y = k * -0.34
    head.rotation.z = k * 0.05
    root.add(head)
    const tail = new THREE.Mesh(track(new RoundedBoxGeometry(0.09, 0.4, 0.16, 2, 0.03)), lampRearMat)
    tail.position.set(-2.03, 1.18, k * 0.7)
    root.add(tail)
    for (const hx of [0.42, -0.62]) {
      const handle = new THREE.Mesh(track(new RoundedBoxGeometry(0.16, 0.05, 0.05, 2, 0.02)), trim)
      handle.position.set(hx, 0.95, k * 0.88)
      root.add(handle)
    }
    const side = k > 0 ? 'right' : 'left'
    const turnFront = new THREE.Mesh(track(new RoundedBoxGeometry(0.12, 0.16, 0.16, 2, 0.03)), turnMat[side])
    turnFront.position.set(2.02, 0.9, k * 0.74)
    root.add(turnFront)
    const turnRear = new THREE.Mesh(track(new RoundedBoxGeometry(0.08, 0.12, 0.14, 2, 0.03)), turnMat[side])
    turnRear.position.set(-2.03, 0.93, k * 0.7)
    root.add(turnRear)
    const reverseLamp = new THREE.Mesh(track(new RoundedBoxGeometry(0.07, 0.1, 0.12, 2, 0.03)), reverseMat)
    reverseLamp.position.set(-2.03, 1.08, k * 0.7)
    root.add(reverseLamp)
    const repeater = new THREE.Mesh(track(new RoundedBoxGeometry(0.1, 0.05, 0.05, 2, 0.02)), turnMat[side])
    repeater.position.set(1.2, 1.0, k * 0.89)
    root.add(repeater)

    // Fog lamps live low in the bumper, where a T30 has them.
    const fog = new THREE.Mesh(track(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14)), fogMat)
    fog.rotation.z = Math.PI / 2
    fog.position.set(2.08, 0.47, k * 0.5)
    root.add(fog)
    const mirror = new THREE.Mesh(track(new RoundedBoxGeometry(0.1, 0.11, 0.22, 2, 0.04)), trim)
    mirror.position.set(0.95, 1.13, k * 0.94)
    root.add(mirror)
    const railBar = new THREE.Mesh(track(new RoundedBoxGeometry(1.9, 0.05, 0.06, 2, 0.025)), rail)
    railBar.position.set(-0.55, 1.74, k * 0.56)
    root.add(railBar)
  }

  const wellMat = track(new THREE.MeshBasicMaterial({ color: colors.tyre, side: THREE.DoubleSide }))
  for (const x of [AXLE_X, -AXLE_X]) {
    for (const k of [1, -1]) {
      const disc = new THREE.Mesh(track(new THREE.CircleGeometry(0.4, 18)), wellMat)
      disc.position.set(x, WHEEL_R, k * 0.56)
      disc.rotation.y = k > 0 ? 0 : Math.PI
      root.add(disc)
      const tunnel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.4, 0.4, 0.24, 18, 1, true)), wellMat)
      tunnel.rotation.x = Math.PI / 2
      tunnel.position.set(x, WHEEL_R, k * 0.68)
      root.add(tunnel)
    }
  }

  for (const x of [AXLE_X, -AXLE_X]) {
    for (const k of [1, -1]) {
      const w = wheel({ tyre: tyreMat, rim: rimMat, spoke: spokeMat, hub: hubMat })
      w.position.set(x, WHEEL_R, k * WHEEL_Z)
      w.scale.z = k
      root.add(w)
    }
  }

  // Openings: a red wash over the panel that is actually open.
  const openings = new Map<DoorName, THREE.Object3D>()
  for (const [name, span] of Object.entries(DOOR_SPANS) as Array<[Exclude<DoorName, 'tailgate'>, [number, number]]>) {
    const k = DOOR_SIDE[name]
    const range: [number, number] = k > 0 ? [0, 4] : [8, 12]
    const geom = track(loft(samples(span[0], span[1], 0.06), lowerLoop, range))
    geom.scale(1, 1, 1.01)
    const mesh = new THREE.Mesh(geom, alertMat)
    mesh.visible = false
    root.add(mesh)
    openings.set(name, mesh)
  }
  const tailgateGeom = track(loft(samples(-2.2, -1.62, 0.06), upperLoop))
  tailgateGeom.scale(1.008, 1.004, 1.008)
  const tailgate = new THREE.Mesh(tailgateGeom, alertMat)
  tailgate.visible = false
  root.add(tailgate)
  openings.set('tailgate', tailgate)

  const materials = { paint, glass, clad, trim, rail, tyreMat, rimMat, spokeMat, hubMat, lampMat, fogMat, turnMat, reverseMat, lampRearMat, wireMat, cutMat, alertMat }

  return {
    root,
    setColors(next: CarColors): void {
      materials.paint.color.set(next.paint)
      materials.glass.color.set(next.glass)
      materials.clad.color.set(next.clad)
      materials.trim.color.set(next.trim)
      materials.rail.color.set(next.rail)
      materials.tyreMat.color.set(next.tyre)
      materials.rimMat.color.set(next.rim)
      materials.spokeMat.color.set(next.spoke)
      materials.hubMat.color.set(next.hub)
      materials.lampMat.color.set(next.lamp)
      materials.fogMat.color.set(next.lamp)
      materials.reverseMat.color.set(next.lamp)
      materials.turnMat.left.color.set(next.lamp)
      materials.turnMat.right.color.set(next.lamp)
      materials.lampRearMat.color.set(next.lampRear)
      materials.wireMat.color.set(next.wire)
      materials.cutMat.color.set(next.wire)
      materials.alertMat.color.set(next.alert)
    },
    setLights({ beam, fog, parking, brake, reverse, indicators }: LampState): void {
      materials.reverseMat.emissiveIntensity = reverse ? 2.0 : 0
      const lit = beam !== 'off'
      materials.lampMat.emissiveIntensity = beam === 'high' ? 2.6 : beam === 'low' ? 1.5 : parking ? 0.35 : 0
      materials.lampMat.color.set(lit || parking ? '#fff6dd' : colors.lamp)
      materials.fogMat.emissiveIntensity = fog ? 1.4 : 0
      materials.fogMat.color.set(fog ? '#ffe9b0' : colors.lamp)
      // Stop lamps are the same bulbs as the tail lamps, only much brighter.
      materials.lampRearMat.emissiveIntensity = brake ? 1.25 : parking || lit ? 0.32 : 0
      for (const side of ['left', 'right'] as const) {
        const on = indicators === 'both' || indicators === side
        materials.turnMat[side].emissiveIntensity = on ? 2.2 : 0
        materials.turnMat[side].color.set(on ? AMBER : colors.lamp)
      }
    },
    setDoors(doors: Partial<Record<DoorName, boolean>>): void {
      for (const [name, mesh] of openings) mesh.visible = Boolean(doors[name])
    },
    setWindows(windows: Partial<Windows>): void {
      for (const [name, groups] of windowGroups) {
        const open = Math.min(100, Math.max(0, windows[name] ?? 0)) / 100
        for (const group of groups) group.scale.y = 1 - open * 0.96
      }
    },
    setRunning(running: boolean): void {
      materials.paint.envMapIntensity = running ? 1.15 : 0.9
      materials.paint.needsUpdate = true
    },
    dispose(): void {
      for (const item of disposables) item.dispose()
    },
  }
}

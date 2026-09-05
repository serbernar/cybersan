import type { Doors, Lights } from '@cybersan/protocol'
import './XTrail.css'

interface Props {
  running: boolean
  doors: Doors
  lights: Lights
}

/** Five-spoke rim, drawn once and reused for both wheels. */
function Rim({ cx, cy }: { cx: number; cy: number }): JSX.Element {
  const spokes = [0, 72, 144, 216, 288]
  return (
    <g className="veh__wheel" transform={`translate(${cx} ${cy})`}>
      <circle className="veh__tyre" r="40" />
      <circle className="veh__tyre-inner" r="30" />
      <circle className="veh__rim" r="27" />
      {spokes.map((angle) => (
        <path key={angle} className="veh__spoke" d="M0 -23 L5 -8 L-5 -8 Z" transform={`rotate(${angle})`} />
      ))}
      <circle className="veh__hub" r="7" />
    </g>
  )
}

/**
 * The T30 in side profile, drawn the way Tesla draws its own car: near
 * monochrome, lit from above, sitting on a soft shadow. Colour appears only
 * where something needs attention.
 *
 * Every opening is its own shape with a stable class name, so this can be
 * swapped for rendered bitmaps later without touching any other component.
 */
export function XTrail({ running, doors, lights }: Props): JSX.Element {
  const beam = lights.lowBeam || lights.highBeam

  return (
    <svg className={`veh ${running ? 'is-running' : ''}`} viewBox="0 0 660 300" preserveAspectRatio="xMidYMid meet" aria-label="Nissan X-Trail T30">
      <defs>
        {/* Stop colours come from CSS variables so the car repaints itself
            with the theme instead of staying a dark cut-out on a light panel. */}
        <linearGradient id="vehPaint" x1="0" y1="0" x2="0" y2="1">
          <stop className="veh-paint-1" offset="0%" />
          <stop className="veh-paint-2" offset="26%" />
          <stop className="veh-paint-3" offset="62%" />
          <stop className="veh-paint-4" offset="100%" />
        </linearGradient>
        <linearGradient id="vehGlass" x1="0" y1="0" x2="0" y2="1">
          <stop className="veh-glass-1" offset="0%" />
          <stop className="veh-glass-2" offset="100%" />
        </linearGradient>
        <linearGradient id="vehSill" x1="0" y1="0" x2="0" y2="1">
          <stop className="veh-sill-1" offset="0%" />
          <stop className="veh-sill-2" offset="100%" />
        </linearGradient>
        <linearGradient id="vehHighlight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="70%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="vehShadow">
          <stop className="veh-shadow-1" offset="0%" />
          <stop className="veh-shadow-2" offset="70%" />
          <stop className="veh-shadow-3" offset="100%" />
        </radialGradient>
        <linearGradient id="vehBeam" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffeec2" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffeec2" stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="330" cy="256" rx="268" ry="20" fill="url(#vehShadow)" />

      {beam && <path className="veh__beam" d="M52 176 L-70 140 L-70 216 Z" fill="url(#vehBeam)" />}

      <g className="veh__shell">
        {/* Roof rails sit proud of the roof — a T30 signature. */}
        <path className="veh__rail" d="M196 36 L406 36" />
        <path
          className="veh__paint"
          d="M46 208 L46 158 Q48 141 68 136 L124 126 L166 46 Q173 34 192 33 L398 33 Q418 34 425 46 L458 124 L536 134 Q566 139 570 160 L570 208 Z"
        />
        <path className="veh__highlight" d="M60 138 L124 127 L166 47 L400 47 L456 126 L556 138 L556 146 L60 148 Z" />
        <path className="veh__sill" d="M46 208 L570 208 L570 220 Q568 226 558 226 L58 226 Q48 226 46 220 Z" />
      </g>

      <g className="veh__glazing">
        <path className="veh__glass" d="M186 122 L214 56 L286 56 L286 122 Z" />
        <path className="veh__glass" d="M298 122 L298 56 L392 56 L424 122 Z" />
        <path className="veh__pillar" d="M288 56 L296 56 L296 122 L288 122 Z" />
      </g>

      {/* Panel gaps. Thin, dark, and exactly where a real T30 has them. */}
      <g className="veh__gaps">
        <path d="M182 126 L182 208" />
        <path d="M294 126 L294 208" />
        <path d="M408 122 L408 208" />
      </g>

      <g className="veh__trim">
        <path className="veh__mirror" d="M196 128 l-22 -5 q-6 -1 -6 5 l0 8 q0 5 6 4 l22 -4 z" />
        <rect className="veh__handle" x="238" y="150" width="30" height="7" rx="3.5" />
        <rect className="veh__handle" x="340" y="150" width="30" height="7" rx="3.5" />
        <path className="veh__cladding" d="M96 208 A50 50 0 0 1 196 208" />
        <path className="veh__cladding" d="M416 208 A50 50 0 0 1 516 208" />
      </g>

      {/* Openings: transparent until something is actually open. */}
      <g className="veh__openings">
        <path className={doors.driver ? 'is-open' : ''} d="M184 126 L292 126 L292 206 L184 206 Z" />
        <path className={doors.rearLeft ? 'is-open' : ''} d="M296 126 L406 126 L406 206 L296 206 Z" />
        <path className={doors.tailgate ? 'is-open' : ''} d="M410 124 L536 134 Q566 139 570 160 L570 206 L410 206 Z" />
      </g>

      <Rim cx={146} cy={208} />
      <Rim cx={466} cy={208} />

      <g className={`veh__lamps ${beam ? 'is-on' : ''}`}>
        <path className="veh__lamp-front" d="M47 152 l26 -4 q6 -1 6 5 l0 12 q0 6 -6 5 l-26 -3 z" />
        <path className="veh__lamp-rear" d="M569 148 l-20 -3 q-5 -1 -5 4 l0 14 q0 5 5 4 l20 -3 z" />
      </g>
    </svg>
  )
}

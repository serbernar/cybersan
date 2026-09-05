import './Arc.css'

/** A single-value ring. Used where a bar would read as "loading". */
export function Arc({
  value,
  max,
  size = 108,
  tone = 'accent',
}: {
  value: number
  max: number
  size?: number
  tone?: 'accent' | 'crit' | 'cool'
}): JSX.Element {
  const stroke = 10
  const radius = size / 2 - stroke / 2
  const circumference = 2 * Math.PI * radius
  const fraction = Math.max(0, Math.min(1, value / (max || 1)))

  return (
    <svg className={`arc arc--${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="arc__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
      <circle
        className="arc__value"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text className="arc__text" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {Math.round(fraction * 100)}%
      </text>
    </svg>
  )
}

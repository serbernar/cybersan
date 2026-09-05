import { useState } from 'react'
import './Keyboard.css'

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '_'],
]

/**
 * On-screen keyboard for the one field the head unit has.
 *
 * Latin only, and that is deliberate: this text becomes the Bluetooth adapter
 * name, and phones show non-ASCII adapter names inconsistently at best.
 */
export function Keyboard({
  title,
  initial,
  maxLength = 32,
  onCancel,
  onSubmit,
}: {
  title: string
  initial: string
  maxLength?: number
  onCancel: () => void
  onSubmit: (value: string) => void
}): JSX.Element {
  const [value, setValue] = useState(initial)
  const [shift, setShift] = useState(true)

  const press = (key: string): void => {
    if (value.length >= maxLength) return
    setValue(value + (shift ? key.toUpperCase() : key))
    setShift(false)
  }

  return (
    <div className="kbd" role="dialog" aria-label={title}>
      <div className="kbd__sheet">
        <header className="kbd__head">
          <span className="label">{title}</span>
          <output className="kbd__field">
            {value || <span className="kbd__placeholder">порожньо</span>}
            <i className="kbd__caret" />
          </output>
        </header>

        <div className="kbd__rows">
          {ROWS.map((row, index) => (
            <div className="kbd__row" key={index}>
              {index === ROWS.length - 1 && (
                <button
                  className={`kbd__key kbd__key--mod ${shift ? 'is-active' : ''}`}
                  onClick={() => setShift(!shift)}
                >
                  ⇧
                </button>
              )}
              {row.map((key) => (
                <button key={key} className="kbd__key" onClick={() => press(key)}>
                  {shift ? key.toUpperCase() : key}
                </button>
              ))}
              {index === ROWS.length - 1 && (
                <button className="kbd__key kbd__key--mod" onClick={() => setValue(value.slice(0, -1))}>
                  ⌫
                </button>
              )}
            </div>
          ))}
          <div className="kbd__row">
            <button className="kbd__key kbd__key--space" onClick={() => press(' ')}>
              пробіл
            </button>
          </div>
        </div>

        <footer className="kbd__foot">
          <button className="kbd__action" onClick={onCancel}>
            Скасувати
          </button>
          <button
            className="kbd__action kbd__action--primary"
            disabled={value.trim().length === 0}
            onClick={() => onSubmit(value.trim())}
          >
            Зберегти
          </button>
        </footer>
      </div>
    </div>
  )
}

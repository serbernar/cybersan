import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Doors, Lights, Windows } from '@cybersan/protocol'
import { XTrail3D } from './components/XTrail3D'
import './styles/tokens.css'
import './model-preview.css'

/**
 * The car on its own, with switches for every state the HUD can put it in.
 * This page is for looking at the model — it is not shipped to the car.
 */

const DOORS: Array<[keyof Doors, string]> = [
  ['driver', 'Водій'],
  ['passenger', 'Пасажир'],
  ['rearLeft', 'Задні ліві'],
  ['rearRight', 'Задні праві'],
  ['tailgate', 'Багажник'],
]

const LIGHTS: Array<[keyof Lights, string]> = [
  ['parking', 'Габарити'],
  ['lowBeam', 'Ближнє'],
  ['highBeam', 'Дальнє'],
  ['fog', 'Протитуманки'],
  ['brake', 'Стопи'],
  ['hazard', 'Аварійка'],
  ['turnLeft', 'Поворот ліворуч'],
  ['turnRight', 'Поворот праворуч'],
]

const WINDOWS: Array<[keyof Windows, string]> = [
  ['driver', 'Водій'],
  ['passenger', 'Пасажир'],
  ['rearLeft', 'Задні ліві'],
  ['rearRight', 'Задні праві'],
]

const NO_DOORS: Doors = { driver: false, passenger: false, rearLeft: false, rearRight: false, tailgate: false }
const SHUT: Windows = { driver: 0, passenger: 0, rearLeft: 0, rearRight: 0 }
const NO_LIGHTS: Lights = {
  parking: false,
  lowBeam: false,
  highBeam: false,
  fog: false,
  brake: false,
  hazard: false,
  turnLeft: false,
  turnRight: false,
}

function Switch({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className={`sw ${on ? 'is-on' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

function Preview(): JSX.Element {
  const [doors, setDoors] = useState<Doors>(NO_DOORS)
  const [windows, setWindows] = useState<Windows>(SHUT)
  const [lights, setLights] = useState<Lights>(NO_LIGHTS)
  const [running, setRunning] = useState(true)
  const [reverse, setReverse] = useState(false)
  const [spin, setSpin] = useState(false)
  const [day, setDay] = useState(false)

  const theme = (next: boolean): void => {
    setDay(next)
    document.documentElement.dataset.theme = next ? 'day' : 'night'
  }

  return (
    <div className="preview">
      <div className="preview__stage">
        <XTrail3D
          running={running}
          doors={doors}
          windows={windows}
          lights={lights}
          reverse={reverse}
          orbit
          spin={spin}
        />
      </div>

      <div className="preview__panel">
        <section>
          <h2>Двері</h2>
          <div className="row">
            {DOORS.map(([key, label]) => (
              <Switch
                key={key}
                label={label}
                on={doors[key]}
                onClick={() => setDoors((prev) => ({ ...prev, [key]: !prev[key] }))}
              />
            ))}
          </div>
        </section>

        <section>
          <h2>Вікна</h2>
          <div className="row">
            {WINDOWS.map(([key, label]) => (
              <label key={key} className="slider">
                <span>
                  {label} <b>{windows[key]}%</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={windows[key]}
                  onChange={(event) =>
                    setWindows((prev) => ({ ...prev, [key]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2>Світло</h2>
          <div className="row">
            {LIGHTS.map(([key, label]) => (
              <Switch
                key={key}
                label={label}
                on={lights[key]}
                onClick={() => setLights((prev) => ({ ...prev, [key]: !prev[key] }))}
              />
            ))}
          </div>
        </section>

        <section>
          <h2>Сцена</h2>
          <div className="row">
            <Switch label="Двигун" on={running} onClick={() => setRunning((prev) => !prev)} />
            <Switch label="Задня передача" on={reverse} onClick={() => setReverse((prev) => !prev)} />
            <Switch label="Обертання" on={spin} onClick={() => setSpin((prev) => !prev)} />
            <Switch label="День" on={day} onClick={() => theme(!day)} />
            <Switch
              label="Скинути"
              on={false}
              onClick={() => {
                setDoors(NO_DOORS)
                setWindows(SHUT)
                setLights(NO_LIGHTS)
                setReverse(false)
                setSpin(false)
              }}
            />
          </div>
        </section>

        <p className="preview__hint">Тягни мишею, щоб покрутити.</p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)

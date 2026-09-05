import { useState } from 'react'
import { useLinkStatus, useVehicle } from '@/state/link'
import { useHealth } from '@/state/health'
import type { Layout, Settings, Theme, Units } from '@/state/settings'
import { BluetoothSection } from './BluetoothSection'
import './SettingsPane.css'

type Tab = 'panel' | 'bluetooth' | 'diagnostics'

const TABS: { id: Tab; label: string }[] = [
  { id: 'panel', label: 'Панель' },
  { id: 'bluetooth', label: 'Bluetooth' },
  { id: 'diagnostics', label: 'Діагностика' },
]

const SOURCE_LABEL: Record<string, string> = {
  obd: 'OBD-II (ELM327)',
  gpio: 'Запалення / GPIO',
  gps: 'GPS',
  media: 'Bluetooth-медіа',
  system: 'Система',
  mock: 'Симулятор',
}

const STATUS_LABEL: Record<string, string> = {
  online: 'працює',
  degraded: 'запускається',
  offline: 'немає звʼязку',
  disabled: 'вимкнено',
}

function Row<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="opt">
      <div className="opt__text">
        <span className="opt__label">{label}</span>
        {hint && <span className="opt__hint">{hint}</span>}
      </div>
      <div className="opt__choices" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            role="radio"
            aria-checked={option.value === value}
            className={`opt__choice ${option.value === value ? 'is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsPane({
  settings,
  update,
  onClose,
}: {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onClose: () => void
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('panel')
  const state = useVehicle()
  const link = useLinkStatus()
  const health = useHealth()

  return (
    <div className="settings">
      <header className="settings__head">
        <nav className="settings__tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={`settings__tab ${item.id === tab ? 'is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="settings__close" onClick={onClose} aria-label="Закрити налаштування">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              d="M6.5 6.5l11 11M17.5 6.5l-11 11"
            />
          </svg>
        </button>
      </header>

      {tab === 'panel' && (
        <section className="settings__body">
          <Row<Theme>
            label="Тема"
            value={settings.theme}
            onChange={(value) => update('theme', value)}
            options={[
              { value: 'night', label: 'Ніч' },
              { value: 'day', label: 'День' },
            ]}
          />
          <Row<Layout>
            label="Орієнтація панелі"
            hint="Альбомна влазить у рамку 2DIN; книжкова потребує власного кріплення"
            value={settings.layout}
            onChange={(value) => update('layout', value)}
            options={[
              { value: 'landscape', label: 'Альбомна' },
              { value: 'portrait', label: 'Книжкова' },
            ]}
          />
          <Row<Units>
            label="Одиниці"
            value={settings.units}
            onChange={(value) => update('units', value)}
            options={[
              { value: 'metric', label: 'км' },
              { value: 'imperial', label: 'милі' },
            ]}
          />
          <div className="opt opt--stack">
            <span className="opt__label">Яскравість · {settings.brightness}%</span>
            <input
              className="opt__slider"
              type="range"
              aria-label="Яскравість"
              min={20}
              max={100}
              value={settings.brightness}
              onChange={(event) => update('brightness', Number(event.target.value))}
              style={{ ['--fill' as string]: `${((settings.brightness - 20) / 80) * 100}%` }}
            />
          </div>
        </section>
      )}

      {tab === 'bluetooth' && (
        <section className="settings__body">
          <BluetoothSection />
        </section>
      )}

      {tab === 'diagnostics' && (
        <section className="settings__body">
          <p className="settings__link">
            <span className={`settings__dot is-${health.tone}`} /> {health.title}
          </p>
          <p className="settings__link">
            Канал даних:{' '}
            <b>
              {link === 'live' ? 'демон' : link === 'offline' ? 'немає звʼязку' : 'підключення…'}
            </b>
          </p>
          <ul className="settings__sources">
            {Object.entries(state.sources).map(([id, info]) => (
              <li key={id} className={`settings__source is-${info?.status}`}>
                <b>{SOURCE_LABEL[id] ?? id}</b>
                <span>{STATUS_LABEL[info?.status ?? 'offline']}</span>
                {info?.detail && <em>{info.detail}</em>}
              </li>
            ))}
          </ul>
          <p className="settings__build">
            cybersan · схема v{state.schema} · {state.system.hostname ?? 'host?'} ·{' '}
            {state.system.cpuTempC === null ? '--' : `CPU ${state.system.cpuTempC}°C`}
          </p>
        </section>
      )}
    </div>
  )
}

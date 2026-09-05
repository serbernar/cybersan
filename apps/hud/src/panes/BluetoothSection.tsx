import { useState } from 'react'
import { useCommand, useVehicle } from '@/state/link'
import { Keyboard } from '@/components/Keyboard'
import './BluetoothSection.css'

const PAIRING_WINDOW_S = 120

/**
 * Bluetooth administration.
 *
 * Two deliberate rules:
 *  - the adapter is invisible unless the driver opens a pairing window, so a
 *    parked car cannot be paired with by whoever walks past;
 *  - disconnecting and forgetting are separate actions. Disconnect ends the
 *    session for the drive; forget removes the pairing and means typing a
 *    phone back in later.
 */
export function BluetoothSection(): JSX.Element {
  const state = useVehicle()
  const send = useCommand()
  const [renaming, setRenaming] = useState(false)
  const [confirmForget, setConfirmForget] = useState<string | null>(null)

  const { adapter, devices } = state.bluetooth
  const pairing = adapter.discoverable

  return (
    <div className="bt">
      <div className="bt__row">
        <div className="bt__text">
          <span className="opt__label">Імʼя пристрою</span>
          <span className="opt__hint">Так магнітола видно в списку Bluetooth на телефоні</span>
        </div>
        <button className="bt__btn" onClick={() => setRenaming(true)}>
          {adapter.alias ?? '—'}
        </button>
      </div>

      <div className="bt__row">
        <div className="bt__text">
          <span className="opt__label">Режим спарювання</span>
          <span className="opt__hint">
            {pairing
              ? `Видима ще ${adapter.discoverableFor} с — знайди її на телефоні`
              : 'Поза цим вікном магнітола невидима і спарити її не можна'}
          </span>
        </div>
        {pairing ? (
          <button className="bt__btn bt__btn--active" onClick={() => send('bt.pairStop')}>
            Зупинити · {adapter.discoverableFor}
          </button>
        ) : (
          <button
            className="bt__btn bt__btn--primary"
            onClick={() => send('bt.pair', { seconds: PAIRING_WINDOW_S })}
          >
            Увімкнути на {PAIRING_WINDOW_S} с
          </button>
        )}
      </div>

      <div className="bt__devices">
        <span className="label">Відомі пристрої</span>
        {devices.length === 0 && <p className="bt__empty">Поки жодного. Увімкни режим спарювання.</p>}

        {devices.map((device) => (
          <div key={device.address} className="bt__device">
            <div className="bt__text">
              <span className="bt__name">
                {device.name}
                {device.connected && <i className="bt__live" aria-label="підключено" />}
              </span>
              <span className="bt__meta num">{device.address}</span>
            </div>

            <div className="bt__actions">
              {device.connected && (
                <button className="bt__btn" onClick={() => send('bt.disconnect', { address: device.address })}>
                  Відключити
                </button>
              )}
              {confirmForget === device.address ? (
                <>
                  <button className="bt__btn" onClick={() => setConfirmForget(null)}>
                    Ні
                  </button>
                  <button
                    className="bt__btn bt__btn--danger"
                    onClick={() => {
                      send('bt.forget', { address: device.address })
                      setConfirmForget(null)
                    }}
                  >
                    Забути
                  </button>
                </>
              ) : (
                <button className="bt__btn" onClick={() => setConfirmForget(device.address)}>
                  Забути
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {renaming && (
        <Keyboard
          title="Імʼя пристрою"
          initial={adapter.alias ?? ''}
          onCancel={() => setRenaming(false)}
          onSubmit={(name) => {
            send('bt.rename', { name })
            setRenaming(false)
          }}
        />
      )}
    </div>
  )
}

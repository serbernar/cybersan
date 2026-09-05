import { useEffect, useRef, useState } from 'react'
import { useCommand, useVehicle } from '@/state/link'
import { useOptimistic } from '@/state/useOptimistic'
import { useThrottled } from '@/state/useThrottled'
import './MediaCard.css'

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The daemon polls AVRCP once a second, which would make the progress bar tick
 * in visible steps. So the card advances position locally between updates and
 * resnaps whenever the phone reports a new one — smooth, and never drifting.
 */
function useSmoothPosition(reported: number, playing: boolean): number {
  const [position, setPosition] = useState(reported)
  const lastReported = useRef(reported)

  useEffect(() => {
    if (reported !== lastReported.current) {
      lastReported.current = reported
      setPosition(reported)
    }
  }, [reported])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setPosition((value) => value + 0.25), 250)
    return () => window.clearInterval(id)
  }, [playing])

  return position
}

/**
 * Now playing, as a card on the main screen rather than a page of its own.
 *
 * It exists only while there is something to control: with no phone connected
 * there is no empty player to look at, and the car gets the space back.
 */
export function MediaCard(): JSX.Element | null {
  const state = useVehicle()
  const send = useCommand()
  const media = state.media
  const playing = media.playback === 'playing'
  const position = useSmoothPosition(media.positionS, playing)
  const [volume, setVolume] = useOptimistic(media.volume)
  const [muted, setMuted] = useOptimistic(media.muted)
  const sendVolume = useThrottled((value: number) => send('media.volume', { value }))

  if (media.title === null || media.playback === 'stopped') return null

  const progress = media.durationS ? Math.min(100, (position / media.durationS) * 100) : 0

  return (
    <section className="media">
      <div className="media__art" aria-hidden="true">
        <span className={`media__source ${playing ? 'is-playing' : ''}`}>
          {media.source === 'bluetooth' ? 'BT' : media.source.toUpperCase()}
        </span>
      </div>

      <div className="media__meta">
        <p className="media__title">{media.title}</p>
        <p className="media__artist">{media.artist ?? '—'}</p>
      </div>

      <div className="media__transport">
        <button className="media__key" onClick={() => send('media.prev')} aria-label="Попередній трек">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M8 12 18 5.5v13zM6 5.5h1.8v13H6z" />
          </svg>
        </button>
        <button
          className="media__key media__key--primary"
          onClick={() => send(playing ? 'media.pause' : 'media.play')}
          aria-label={playing ? 'Пауза' : 'Відтворити'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" d="M7.5 4.8 19 12 7.5 19.2z" />
            </svg>
          )}
        </button>
        <button className="media__key" onClick={() => send('media.next')} aria-label="Наступний трек">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M16 12 6 18.5v-13zM16.2 5.5H18v13h-1.8z" />
          </svg>
        </button>
      </div>

      <div className="media__progress">
        <div className="media__track"><div style={{ width: `${progress}%` }} /></div>
        <div className="media__times num">
          <span>{clock(position)}</span>
          <span>{media.durationS ? clock(media.durationS) : '--:--'}</span>
        </div>
      </div>

      <div className="media__volume">
        <button
          className={`media__mute ${muted ? 'is-muted' : ''}`}
          onClick={() => {
            setMuted(!muted)
            send('media.mute')
          }}
          aria-label={muted ? 'Увімкнути звук' : 'Вимкнути звук'}
          aria-pressed={muted}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M4 9.5h3.2L12 5.8v12.4L7.2 14.5H4z" />
              {muted ? (
                <path d="M16 10l4 4M20 10l-4 4" />
              ) : (
                <path d="M15.6 9.6a3.4 3.4 0 0 1 0 4.8" />
              )}
            </g>
          </svg>
        </button>
        <input
          className={`media__slider ${muted ? 'is-muted' : ''}`}
          type="range"
          aria-label="Гучність"
          min={0}
          max={100}
          value={volume}
          onChange={(event) => {
            const next = Number(event.target.value)
            // The thumb follows the finger at full rate; the daemon hears a
            // few commands a second, and always the value it ended on.
            setVolume(next)
            sendVolume(next)
          }}
          style={{ ['--fill' as string]: `${volume}%` }}
        />
        <span className={`media__level num ${muted ? 'is-muted' : ''}`}>
          {muted ? '—' : volume}
        </span>
      </div>
    </section>
  )
}

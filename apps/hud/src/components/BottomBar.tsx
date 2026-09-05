import './BottomBar.css'

/**
 * One control, permanently: settings.
 *
 * No home button — home is what everything else opens over. No volume either:
 * it belongs to the media card, which only exists while something is playing.
 * A volume stepper with nothing to make louder is furniture.
 */
export function BottomBar({
  settingsOpen,
  onToggleSettings,
}: {
  settingsOpen: boolean
  onToggleSettings: () => void
}): JSX.Element {
  return (
    <footer className="dock">
      <button
        className={`dock__gear ${settingsOpen ? 'is-active' : ''}`}
        onClick={onToggleSettings}
        aria-label={settingsOpen ? 'Закрити налаштування' : 'Налаштування'}
        aria-pressed={settingsOpen}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
          </g>
        </svg>
        <span>Налаштування</span>
      </button>
    </footer>
  )
}

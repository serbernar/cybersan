import { useState } from 'react'
import { LinkProvider } from '@/state/link'
import { useSettings } from '@/state/settings'
import { useStageFit } from '@/state/useStageFit'
import { StatusBar } from '@/components/StatusBar'
import { BottomBar } from '@/components/BottomBar'
import { CarCard } from '@/components/CarCard'
import { MediaCard } from '@/components/MediaCard'
import { Toast } from '@/components/Toast'
import { BootScreen } from '@/screens/BootScreen'
import { HomePane } from '@/panes/HomePane'
import { SettingsPane } from '@/panes/SettingsPane'
import './App.css'

const STAGE = {
  landscape: { width: 1024, height: 600 },
  portrait: { width: 600, height: 1024 },
} as const

export function App(): JSX.Element {
  const [settings, update] = useSettings()
  const [booted, setBooted] = useState(() => !settings.showSplash)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const stage = STAGE[settings.layout]
  const scale = useStageFit(stage.width, stage.height)

  return (
    <LinkProvider>
      <div
        className="stage"
        style={{ width: stage.width, height: stage.height, transform: `scale(${scale})` }}
      >
        {!booted && <BootScreen onDone={() => setBooted(true)} />}

        <div className="shell">
          <StatusBar units={settings.units} onOpenDiagnostics={() => setSettingsOpen(true)} />

          {/* The car is the screen. Everything else opens beside it. */}
          <div className="shell__car">
            <CarCard units={settings.units} />
            <MediaCard />
          </div>

          <main className="pane">
            {settingsOpen ? (
              <SettingsPane settings={settings} update={update} onClose={() => setSettingsOpen(false)} />
            ) : (
              <HomePane units={settings.units} />
            )}
          </main>

          <BottomBar settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen(!settingsOpen)} />
        </div>

        <Toast />

        {/* Software dimming until the panel exposes real backlight control. */}
        <div className="dimmer" style={{ opacity: (100 - settings.brightness) / 130 }} />
      </div>
    </LinkProvider>
  )
}

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { CommandName, VehicleState } from '@cybersan/protocol'
import { VehicleLink, defaultSocketUrl, type LinkError, type LinkStatus } from '@/transport/connection'

const LinkContext = createContext<VehicleLink | null>(null)

export function LinkProvider({ children }: { children: ReactNode }): JSX.Element {
  const link = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return new VehicleLink(params.get('ws') ?? defaultSocketUrl())
  }, [])

  useEffect(() => {
    link.connect()
    return () => link.dispose()
  }, [link])

  return <LinkContext.Provider value={link}>{children}</LinkContext.Provider>
}

function useLink(): VehicleLink {
  const link = useContext(LinkContext)
  if (!link) throw new Error('useLink must be used inside <LinkProvider>')
  return link
}

export function useVehicle(): VehicleState {
  const link = useLink()
  return useSyncExternalStore(link.subscribe, link.getSnapshot)
}

export function useLinkStatus(): LinkStatus {
  const link = useLink()
  return useSyncExternalStore(link.subscribe, link.getStatus)
}

export function useCommandError(): LinkError | null {
  const link = useLink()
  return useSyncExternalStore(link.subscribe, link.getError)
}

export function useCommand(): (name: CommandName, args?: Record<string, unknown>) => void {
  const link = useLink()
  return (name, args) => link.send(name, args)
}

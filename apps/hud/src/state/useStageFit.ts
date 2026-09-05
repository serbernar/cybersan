import { useEffect, useState } from 'react'

/**
 * Scale factor that fits a fixed design size onto the attached panel.
 *
 * Measured from React rather than at module load: on the Pi, Chromium reports a
 * provisional viewport before the compositor settles, and a scale computed then
 * would stick for the whole session.
 */
export function useStageFit(width: number, height: number): number {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const measure = (): void => {
      const available = {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      }
      setScale(Math.min(available.width / width, available.height / height))
    }

    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)

    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [width, height])

  return scale
}

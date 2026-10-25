import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react'
import { pageHash, parsePageHash } from '../utils/navigation'
import type { PageName } from '../types/navigation'

const navigationEvent = 'ccnu:navigate'
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  window.addEventListener(navigationEvent, listener)
  return () => { window.removeEventListener('hashchange', listener); window.removeEventListener('popstate', listener); window.removeEventListener(navigationEvent, listener) }
}
const snapshot = () => window.location.hash
export function usePageNavigation() {
  const hash = useSyncExternalStore(subscribe, snapshot, () => '#/')
  const route = parsePageHash(hash)
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.history.scrollRestoration = previous }
  }, [])
  useLayoutEffect(() => {
    const current = parsePageHash(hash)
    const canonical = pageHash(current.page, current.section)
    if (hash !== canonical) {
      window.history.replaceState(null, '', canonical)
      window.dispatchEvent(new Event(navigationEvent))
    }
    if (current.section === 'events') document.getElementById('events')?.scrollIntoView({ behavior: 'instant', block: 'start' })
    else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [hash])
  const navigate = useCallback((page: PageName) => {
    const hash = pageHash(page)
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash)
      window.dispatchEvent(new Event(navigationEvent))
    } else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [])
  return { page: route.page, navigate }
}

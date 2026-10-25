import { useSyncExternalStore } from 'react'

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => { now = Date.now(); listeners.forEach(update => update()) }, 30000)
  }
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined } }
}
export function useActivityClock() { return useSyncExternalStore(subscribe, () => now, () => now) }

import type { Event } from '../types/event'

export function mergeSavedActivities(saved: Event[], updates: Event[]): Event[] {
  const latest = new Map(updates.map(event => [event.id, event]))
  // Missing IDs may be private mock/AI results, not deleted publications.
  // Never remove saved activities, import other activities or change order.
  return saved.map(event => latest.get(event.id) || event)
}

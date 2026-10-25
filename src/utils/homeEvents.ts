import type { Event } from '../types/event'
import { activityDate } from './eventFilters.ts'
import { eventSource } from './eventPresentation.ts'

export function upcomingPublishedEvents(events: Event[], now = Date.now(), limit = 8): Event[] {
  const local = new Date(now + 8 * 3600000)
  const today = local.toISOString().slice(0, 10)
  return events.filter(event => eventSource(event) === 'published' && !event.withdrawn)
    .map(event => ({ event, date: activityDate(event.time, local.getUTCFullYear()) }))
    .filter(item => item.date === null || item.date >= today)
    .sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'))
    .slice(0, limit).map(item => item.event)
}

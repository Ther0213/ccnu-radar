import type { Event } from '../types/event'

export interface ActivityFilters { query: string; category: string; startDate: string; endDate: string; availability: string; minSlots: string }
export const emptyFilters: ActivityFilters = { query: '', category: '全部', startDate: '', endDate: '', availability: 'all', minSlots: '' }

// Only explicit dates are supported; do not guess the meaning of “下周五”等。
export function activityDate(text: string, year = new Date(Date.now() + 8 * 3600000).getUTCFullYear()): string | null {
  const match = text.trim().match(/^(?:(\d{4})[-/年])?\s*(\d{1,2})[-/月]\s*(\d{1,2})(?:日|号)?(?=$|[\sT至到—～~（(·])/)
  if (!match) return null
  const y = Number(match[1] || year), m = Number(match[2]), d = Number(match[3])
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function matchesActivity(event: Event, filters: ActivityFilters): boolean {
  if (event.withdrawn) return false
  if (filters.minSlots !== '' && (!Number.isInteger(Number(filters.minSlots)) || Number(filters.minSlots) < 1 || Number(filters.minSlots) > 100000)) return false
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const text = [event.title, event.type, event.location, event.audience, event.description, event.summary].join(' ').toLocaleLowerCase()
  if (filters.category !== '全部' && event.type !== filters.category || !words.every(word => text.includes(word))) return false
  if (filters.startDate || filters.endDate) {
    const date = activityDate(event.time)
    if (!date || filters.startDate && date < filters.startDate || filters.endDate && date > filters.endDate) return false
  }
  const countKnown = typeof event.registeredCount === 'number'
  const remaining = countKnown && event.maxParticipants !== null ? Math.max(0, event.maxParticipants - event.registeredCount!) : null
  if (filters.availability === 'available' && (!countKnown || remaining === 0)) return false
  if (filters.availability === 'limited' && (remaining === null || remaining <= 0)) return false
  if (filters.availability === 'unlimited' && (!countKnown || event.maxParticipants !== null)) return false
  if (filters.availability === 'full' && remaining !== 0) return false
  if (filters.minSlots !== '' && (remaining === null || remaining < Number(filters.minSlots))) return false
  return true
}

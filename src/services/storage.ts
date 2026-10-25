import type { Event, EventType } from '../types/event'
import { normalizeCapacity } from '../utils/capacity.ts'

const STORAGE_KEY = 'ccnu-radar:my-events'
const eventTypes: EventType[] = ['赛事', '讲座', '志愿服务', '社团活动', '校园活动', '待确认']
const isEvent = (value: unknown): value is Partial<Event> & Pick<Event, 'id' | 'title'> => { if (!value || typeof value !== 'object') return false; const event = value as Record<string, unknown>; return typeof event.id === 'string' && typeof event.title === 'string' }
const normalizeEvent = (event: Partial<Event> & Pick<Event, 'id' | 'title'>): Event => ({ id: event.id, title: event.title, type: eventTypes.includes(event.type as EventType) ? event.type as EventType : '校园活动', time: event.time || '待确认', deadline: event.deadline || '待确认', location: event.location || '待确认', audience: event.audience || '全校师生', description: event.description || '暂未提供活动说明。', summary: event.summary || '待确认', recommendation: event.recommendation || '待确认', urgency: event.urgency || '待确认', maxParticipants: normalizeCapacity(event.maxParticipants), ...(Number.isInteger(event.registeredCount) && event.registeredCount! >= 0 ? { registeredCount: event.registeredCount } : {}), withdrawn: event.withdrawn === true, cancellationReason: typeof event.cancellationReason === 'string' ? event.cancellationReason : '', ...(['published', 'demo', 'local'].includes(event.source || '') ? { source: event.source } : {}) })
export function getMyEvents(): Event[] { try { const stored = localStorage.getItem(STORAGE_KEY); if (!stored) return []; const parsed: unknown = JSON.parse(stored); return Array.isArray(parsed) ? parsed.filter(isEvent).map(event => ({ ...normalizeEvent(event), qqGroup: typeof event.qqGroup === 'string' ? event.qqGroup.trim() : '' })) : [] } catch { return [] } }
export function saveMyEvents(events: Event[]): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)) }
export function removeMyEvent(id: string): Event[] {
  const nextEvents = getMyEvents().filter((event) => event.id !== id)
  saveMyEvents(nextEvents)
  return nextEvents
}
export function addMyEvent(event: Event): Event[] { const events = getMyEvents(); const nextEvents = events.some((item) => item.id === event.id) ? events : [...events, event]; saveMyEvents(nextEvents); return nextEvents }

import type { Event, EventSource } from '../types/event'

const demoIds = new Set(['innovation', 'lecture', 'volunteer', 'contest'])
export function markPublished<T extends Event>(event: T): T & { source: 'published' } { return { ...event, source: 'published' } }
export function eventSource(event: Event): EventSource {
  return event.source || (demoIds.has(event.id) ? 'demo' : 'local')
}

// Same supported formats and China Standard Time semantics as the backend.
export function noticeDeadline(value: string, now = Date.now()): number | null {
  if (typeof value !== 'string') return null
  const match = value.trim().replace(/\s*(之前|前)$/, '').match(/^(?:(\d{4})[-/年])?\s*(\d{1,2})[-/月]\s*(\d{1,2})日?(?:[T\s·]+(\d{1,2})[:：](\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const year = Number(match[1] || new Date(now + 8 * 3600000).getUTCFullYear())
  const month = Number(match[2]), day = Number(match[3])
  const hour = match[4] === undefined ? 23 : Number(match[4])
  const minute = match[5] === undefined ? 59 : Number(match[5])
  const second = match[6] === undefined ? (match[4] === undefined ? 59 : 0) : Number(match[6])
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null
  return local.getTime() - 8 * 3600000
}

export function eventState(event: Event, now = Date.now()): { kind: string; label: string } {
  if (event.withdrawn) return { kind: 'cancelled', label: '已取消' }
  const source = eventSource(event)
  if (source === 'demo') return { kind: 'demo', label: '演示' }
  if (source === 'local') return { kind: 'local', label: '未发布' }
  const deadline = noticeDeadline(event.deadline, now)
  if (deadline !== null && deadline <= now) return { kind: 'closed', label: '已截止' }
  if (event.maxParticipants !== null && typeof event.registeredCount === 'number' && event.registeredCount >= event.maxParticipants) return { kind: 'full', label: '已满员' }
  if (deadline === null) return { kind: 'pending', label: '截止待确认' }
  if (typeof event.registeredCount !== 'number') return { kind: 'pending', label: '名额待确认' }
  return { kind: 'open', label: '报名中' }
}

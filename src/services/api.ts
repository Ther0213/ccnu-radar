import type { Event } from '../types/event'
import { normalizeCapacity } from '../utils/capacity.ts'
import { onboardingFailureMessage } from '../utils/onboarding.ts'
import { markPublished } from '../utils/eventPresentation.ts'

export type EventPublication = Pick<Event, 'title' | 'type' | 'time' | 'deadline' | 'location' | 'audience' | 'description' | 'maxParticipants' | 'qqGroup'>
const PUBLISHER_KEY = 'ccnu-radar:publisher-token'

export interface User { id: string; studentId: string; onboardingCompleted?: boolean }

async function authRequest(action: 'me' | 'login' | 'register' | 'logout' | 'onboarding', credentials?: { studentId: string; password: string }): Promise<{ user?: User | null }> {
  let legacyToken: string | null = null
  try { if (credentials) legacyToken = localStorage.getItem(PUBLISHER_KEY) } catch { /* Cookie login works even if localStorage is unavailable. */ }
  const response = await fetch(`/api/auth/${action}`, {
    method: action === 'me' ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {}) },
    ...(action !== 'me' ? { body: JSON.stringify(credentials || {}) } : {}),
    signal: AbortSignal.timeout(15000),
  }).catch(() => { throw new Error('无法连接账号服务，请确认后端已启动。') })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(action === 'onboarding' ? onboardingFailureMessage(response.status) : data?.message || '账号服务暂不可用，请重启后端后重试。')
  return data
}

export async function getCurrentUser(): Promise<User | null> { return (await authRequest('me')).user || null }
export async function authenticate(action: 'login' | 'register', studentId: string, password: string): Promise<User> {
  const data = await authRequest(action, { studentId, password })
  if (!data.user) throw new Error('登录响应格式异常。')
  // The server consumes the legacy capability when binding activities to this account.
  try { localStorage.removeItem(PUBLISHER_KEY) } catch { /* Session itself is stored in HttpOnly Cookie. */ }
  return data.user
}
export async function logout(): Promise<void> { await authRequest('logout') }
export async function completeOnboarding(): Promise<User> {
  const data = await authRequest('onboarding')
  if (!data.user || data.user.onboardingCompleted !== true) throw new Error('教程状态保存失败，请重试。')
  return data.user
}

async function eventsRequest(method: 'GET' | 'POST', body?: EventPublication) {
  const response = await fetch('/api/events', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  }).catch(() => { throw new Error('无法连接活动服务，请确认后端已启动。') })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.message || '活动服务暂不可用，请重启后端后重试。')
  return data
}

export async function getPublishedEvents(): Promise<Event[]> {
  const data = await eventsRequest('GET')
  if (!Array.isArray(data.events)) throw new Error('活动列表格式异常。')
  return data.events.map(markPublished)
}

export async function getActivityCatalog(): Promise<{ events: Event[]; withdrawnIds: string[] }> {
  const data = await eventsRequest('GET')
  if (!Array.isArray(data.events) || !Array.isArray(data.withdrawnIds)) throw new Error('活动目录格式异常，请重启后端。')
  return { ...data, events: data.events.map(markPublished) }
}

export async function getSavedActivityUpdates(ids: string[]): Promise<Event[]> {
  const events: Event[] = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const response = await fetch('/api/events/saved', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }), signal: AbortSignal.timeout(10000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(data?.events)) throw new Error(data?.message || '无法同步已保存活动。')
    events.push(...data.events.map(markPublished))
  }
  return events
}

async function managementRequest(url: string, method: 'GET' | 'DELETE') {
  const response = await fetch(url, { method, credentials: 'same-origin', signal: AbortSignal.timeout(10000) }).catch(() => { throw new Error('无法连接活动服务，请确认后端已启动。') })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.message || '活动管理失败，请重试。')
  return data
}

export async function getMyPublications(): Promise<Event[]> {
  const data = await managementRequest('/api/my-publications', 'GET')
  if (!Array.isArray(data.events)) throw new Error('我的发布列表格式异常。')
  return data.events.map(markPublished)
}

export async function withdrawPublication(id: string): Promise<void> {
  await managementRequest(`/api/events/${encodeURIComponent(id)}`, 'DELETE')
}

export async function publishEvent(event: EventPublication): Promise<Event> {
  const data = await eventsRequest('POST', event)
  if (!data.event?.id) throw new Error('发布响应格式异常。')
  return markPublished(data.event)
}

export async function parseEventWithAI(text: string): Promise<Event> {
  let response: Response
  try {
    response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(55000),
    })
  } catch {
    throw new Error('无法连接解析服务或请求超时，请确认后端已启动，或使用模拟解析。')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.message || '解析失败，请确认后端已启动或使用模拟解析。')
  const event = data?.event
  const fields = ['id', 'title', 'type', 'time', 'deadline', 'location', 'audience', 'description', 'summary', 'recommendation', 'urgency']
  if (!event || fields.some(field => typeof event[field] !== 'string')) throw new Error('解析结果格式不正确，请重试。')
  return { ...event, source: 'local', maxParticipants: normalizeCapacity(event.maxParticipants) } as Event
}

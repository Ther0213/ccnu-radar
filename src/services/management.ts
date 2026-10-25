import type { Event } from '../types/event'
import type { EventPublication } from './api'
import { markPublished } from '../utils/eventPresentation'

export interface Participant { studentId: string; registeredAt: number }
export interface Notice { id: string; eventId: string; title: string; body: string; createdAt: number; readAt: number | null }

async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method, credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }).catch(() => { throw new Error('无法连接活动服务，请确认后端已启动。') })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.message || '操作失败，请稍后重试。')
  }
  return response
}
const eventPath = (id: string) => `/api/events/${encodeURIComponent(id)}`
export async function updatePublication(id: string, input: EventPublication): Promise<Event> {
  return markPublished((await (await request(eventPath(id), 'PUT', input)).json()).event)
}
export async function cancelPublication(id: string, reason: string): Promise<void> {
  await request(`${eventPath(id)}/cancel`, 'POST', { reason })
}
export async function getParticipants(id: string): Promise<Participant[]> {
  return (await (await request(`${eventPath(id)}/participants`)).json()).participants
}
export async function exportParticipants(id: string): Promise<void> {
  const response = await request(`${eventPath(id)}/participants?format=csv`)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = 'CCNU-Radar-报名名单.csv'
  document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function getNotifications(): Promise<Notice[]> {
  return (await (await request('/api/notifications')).json()).notifications
}
export async function readNotification(id?: string): Promise<void> {
  await request(id ? `/api/notifications/${encodeURIComponent(id)}/read` : '/api/notifications/read-all', 'POST', {})
}

import type { RegisteredEvent, RegistrationInfo } from '../types/registration'
import { markPublished } from '../utils/eventPresentation.ts'

async function request(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const response = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
    signal: AbortSignal.timeout(10000),
  }).catch(() => { throw new Error('无法连接报名服务，请确认后端已启动。') })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.message || '报名服务暂不可用，请刷新或稍后重试。')
  return data
}

export async function getRegistrationInfo(id: string): Promise<RegistrationInfo> {
  return (await request(`/api/events/${encodeURIComponent(id)}/registration`)).registration
}
export async function registerForEvent(id: string): Promise<RegistrationInfo> {
  return (await request(`/api/events/${encodeURIComponent(id)}/registration`, 'POST')).registration
}
export async function cancelRegistration(id: string): Promise<RegistrationInfo> {
  return (await request(`/api/events/${encodeURIComponent(id)}/registration`, 'DELETE')).registration
}
export async function getMyRegistrations(): Promise<RegisteredEvent[]> {
  const data = await request('/api/registrations')
  if (!Array.isArray(data.events)) throw new Error('报名列表格式异常。')
  return data.events.map(markPublished)
}

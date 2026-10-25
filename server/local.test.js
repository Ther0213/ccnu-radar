import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './index.js'
import { createAuthStore } from './auth.js'
import { createEventStore } from './events.js'

test('本地同源入口：网页可用、HTTP 会话保留、发布报名闭环、私密文件不暴露', async context => {
  const authStore = createAuthStore(':memory:'), eventStore = createEventStore(':memory:')
  const staticDirectory = mkdtempSync(join(tmpdir(), 'ccnu-local-test-'))
  writeFileSync(join(staticDirectory, 'index.html'), '<!doctype html><title>CCNU Radar</title>')
  let origin
  const server = createApp({ authStore, eventStore, staticDirectory, secureCookies: false, getAllowedOrigins: () => [origin] }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = `http://127.0.0.1:${server.address().port}`
  context.after(async () => { await new Promise(resolve => server.close(resolve)); authStore.close(); eventStore.close() })
  const request = (path, method = 'GET', body, cookie) => fetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.match(await (await request('/')).text(), /CCNU Radar/)
  assert.equal((await (await request('/api/health')).json()).status, 'ok')
  for (const path of ['/server/.env', '/server/data/events.sqlite', '/.git/config', '/src/App.tsx']) assert.equal((await request(path)).status, 404)
  const registration = await request('/api/auth/register', 'POST', { studentId: '2026999910', password: 'LocalFixture!123' })
  assert.equal(registration.status, 201)
  const cookieHeader = registration.headers.get('set-cookie')
  assert.doesNotMatch(cookieHeader, /; Secure/i)
  assert.match(cookieHeader, /HttpOnly/i)
  const cookie = cookieHeader.split(';')[0]
  assert.equal((await (await request('/api/auth/me', 'GET', undefined, cookie)).json()).user.studentId, '2026999910')
  const published = await request('/api/events', 'POST', { title: '验收活动', type: '校园活动', time: '2099-11-10 19:00', deadline: '2099-11-09 23:59', location: '测试教室', audience: '测试学生', description: '隔离测试数据', maxParticipants: 1, qqGroup: '123456789' }, cookie)
  assert.equal(published.status, 201)
  const event = (await published.json()).event
  const enrolled = await request(`/api/events/${event.id}/registration`, 'POST', {}, cookie)
  assert.equal(enrolled.status, 200)
  assert.equal((await enrolled.json()).registration.registeredCount, 1)
  assert.equal((await (await request('/api/events')).json()).events[0].qqGroup, '123456789')
  await request('/api/auth/logout', 'POST', {}, cookie)
  assert.equal((await (await request('/api/auth/me', 'GET', undefined, cookie)).json()).user, null)
})

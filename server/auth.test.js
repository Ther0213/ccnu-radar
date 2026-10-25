import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createAuthStore, validateCredentials } from './auth.js'
import { createEventStore, validatePublication } from './events.js'
import { createApp } from './index.js'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const publication = { title: '账号权限测试讲座', type: '讲座', time: '10月26日', deadline: '待确认', location: '科学会堂', audience: '全校师生', description: '仅供自动化验证的活动' }

test('注册、会话、登录、退出、旧发布迁移与账号权限', async (context) => {
  const authStore = createAuthStore(':memory:')
  const eventStore = createEventStore(':memory:')
  const legacyToken = randomUUID()
  const legacy = validatePublication(publication)
  eventStore.publish(legacy, legacyToken)
  const server = createApp({ authStore, eventStore }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { await new Promise(resolve => server.close(resolve)); authStore.close(); eventStore.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, method = 'GET', body, cookie, extraHeaders = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') }
  }
  assert.equal((await request('/api/events', 'POST', publication)).status, 401)
  assert.equal((await request('/api/auth/register', 'POST', { studentId: 'abc', password: 'Example!234' })).status, 400)
  const credentials = { studentId: '2026000001', password: 'Example!234' }
  const first = await request('/api/auth/register', 'POST', credentials, undefined, { Authorization: `Bearer ${legacyToken}` })
  assert.equal(first.status, 201)
  assert.match(first.cookie, /HttpOnly/i)
  assert.match(first.cookie, /SameSite=Lax/i)
  assert.equal(JSON.stringify(first.data).includes(credentials.password), false)
  const cookieA = first.cookie.split(';')[0]
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookieA)).data.user.studentId, credentials.studentId)
  assert.equal((await request('/api/auth/register', 'POST', credentials)).status, 409)
  assert.equal((await request('/api/auth/login', 'POST', { ...credentials, password: 'incorrect123' })).status, 401)
  assert.equal((await request('/api/my-publications', 'GET', undefined, cookieA)).data.events[0].id, legacy.id)
  const published = await request('/api/events', 'POST', publication, cookieA)
  assert.equal(published.status, 201)
  const id = published.data.event.id
  const second = await request('/api/auth/register', 'POST', { studentId: '2026000002', password: 'Example!567' }, undefined, { Authorization: `Bearer ${legacyToken}` })
  const cookieB = second.cookie.split(';')[0]
  assert.equal((await request('/api/my-publications', 'GET', undefined, cookieB)).data.events.length, 0)
  assert.equal((await request(`/api/events/${id}`, 'DELETE', undefined, cookieB)).status, 404)
  assert.equal((await request(`/api/events/${id}`, 'DELETE', undefined, cookieA, { Origin: 'https://other.example' })).status, 403)
  assert.equal((await request(`/api/events/${id}`, 'DELETE', undefined, cookieA)).status, 200)
  assert.ok((await request('/api/events')).data.withdrawnIds.includes(id))
  assert.equal((await request('/api/auth/logout', 'POST', {}, cookieA)).status, 200)
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookieA)).data.user, null)
  assert.equal((await request('/api/my-publications', 'GET', undefined, cookieA)).status, 401)
  const login = await request('/api/auth/login', 'POST', credentials)
  assert.equal(login.status, 200)
  assert.equal((await request('/api/my-publications', 'GET', undefined, login.cookie.split(';')[0])).data.events[0].id, legacy.id)
  let limited
  for (let i = 0; i < 21; i++) limited = await request('/api/auth/login', 'POST', {})
  assert.equal(limited.status, 429)
})

test('密码校验与服务端会话撤销', async () => {
  assert.throws(() => validateCredentials({ studentId: '2026000001', password: 'short' }))
  const auth = createAuthStore(':memory:')
  try {
    const user = await auth.register('2026000003', 'TestOnly!234')
    const session = auth.issueSession(user.id)
    assert.equal(auth.getUser(session).id, user.id)
    assert.equal(await auth.login('2026000003', 'WrongPass!234'), null)
    assert.equal(auth.getUser(randomUUID()), null)
    auth.revoke(session)
    assert.equal(auth.getUser(session), null)
  } finally { auth.close() }
})

test('账号与会话重启后保留、密码不以明文保存、过期会话无效', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ccnu-auth-test-')), 'accounts.sqlite')
  const first = createAuthStore(path)
  const password = 'Temporary!123'
  const user = await first.register('2026000004', password)
  const session = first.issueSession(user.id)
  first.close()
  const second = createAuthStore(path)
  const db = new DatabaseSync(path)
  try {
    assert.equal((await second.login('2026000004', password)).id, user.id)
    assert.equal(second.getUser(session).id, user.id)
    const row = db.prepare('SELECT salt, password_hash FROM users WHERE id = ?').get(user.id)
    assert.notEqual(row.password_hash, password)
    assert.equal(row.salt.length, 32)
    assert.equal(row.password_hash.length, 128)
    db.prepare('UPDATE sessions SET expires_at = 0').run()
    assert.equal(second.getUser(session), null)
  } finally { db.close(); second.close() }
})

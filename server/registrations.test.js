import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './index.js'
import { createAuthStore } from './auth.js'
import { createEventStore, validatePublication } from './events.js'
import { deadlineTimestamp } from './registrations.js'

const input = { title: '限额报名测试', type: '讲座', time: '2099年10月26日 19:00', deadline: '2099年10月20日 12:00', location: '科学会堂', audience: '学生', description: '名额测试', maxParticipants: 1 }

test('报名 HTTP 流程：登录校验、最后名额竞争、重复报名、取消释放、撤回限制', async context => {
  const authStore = createAuthStore(':memory:')
  const eventStore = createEventStore(':memory:')
  const users = await Promise.all(['2026100001', '2026100002', '2026100003'].map(id => authStore.register(id, 'TestOnly!123')))
  const cookies = users.map(user => `ccnu_session=${authStore.issueSession(user.id)}`)
  const event = validatePublication(input)
  eventStore.publishByUser(event, users[0].id)
  const server = createApp({ authStore, eventStore }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { await new Promise(resolve => server.close(resolve)); authStore.close(); eventStore.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, method = 'GET', cookie) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) })
    return { status: response.status, data: await response.json() }
  }
  const endpoint = `/api/events/${event.id}/registration`
  assert.equal((await request(endpoint, 'POST')).status, 401)
  const publicInfo = (await request(endpoint)).data.registration
  assert.equal(publicInfo.registeredCount, 0)
  assert.equal(publicInfo.canRegister, false)
  const results = await Promise.all([request(endpoint, 'POST', cookies[1]), request(endpoint, 'POST', cookies[2])])
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409])
  const winner = results[0].status === 200 ? 1 : 2
  const loser = winner === 1 ? 2 : 1
  const repeated = await request(endpoint, 'POST', cookies[winner])
  assert.equal(repeated.status, 200)
  assert.equal(repeated.data.registration.registeredCount, 1)
  assert.equal(repeated.data.registration.remainingSlots, 0)
  assert.equal((await request('/api/registrations', 'GET', cookies[winner])).data.events.length, 1)
  assert.equal((await request('/api/registrations', 'GET', cookies[loser])).data.events.length, 0)
  // Cancelling another account's nonexistent registration must not release the winner's seat.
  assert.equal((await request(endpoint, 'DELETE', cookies[loser])).data.registration.registeredCount, 1)
  assert.equal((await request(endpoint, 'DELETE', cookies[winner])).data.registration.remainingSlots, 1)
  assert.equal((await request(endpoint, 'POST', cookies[loser])).status, 200)
  assert.equal((await request('/api/events')).data.events[0].registeredCount, 1)
  assert.equal((await request(`/api/events/${event.id}`, 'DELETE', cookies[0])).status, 200)
  assert.equal((await request(endpoint, 'POST', cookies[winner])).status, 409)
  assert.equal((await request('/api/registrations', 'GET', cookies[loser])).data.events[0].withdrawn, true)
  assert.equal((await request(endpoint, 'DELETE', cookies[loser])).data.registration.registeredCount, 0)
  assert.equal((await request('/api/events/not-published/registration', 'POST', cookies[1])).status, 404)
})

test('报名持久化、已截止活动、未设上限及旧活动兼容', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ccnu-registration-test-')), 'events.sqlite')
  const first = createEventStore(path)
  const event = validatePublication(input)
  first.publishByUser(event, 'publisher')
  first.register(event.id, 'student-a')
  first.close()
  const reopened = createEventStore(path)
  try {
    assert.equal(reopened.registrationInfo(event.id, 'student-a').isRegistered, true)
    assert.equal(reopened.myRegistrations('student-a').length, 1)
    assert.throws(() => reopened.register(event.id, 'student-b'), /名额已满/)
    const expired = validatePublication({ ...input, deadline: '2000年1月1日 00:00' })
    reopened.publishByUser(expired, 'publisher')
    assert.throws(() => reopened.register(expired.id, 'student-a'), /截止/)
    const legacy = validatePublication({ ...input, maxParticipants: null, deadline: '待确认' })
    reopened.publish(legacy)
    assert.equal(reopened.register(legacy.id, 'student-a').remainingSlots, null)
    assert.equal(reopened.register(legacy.id, 'student-b').registeredCount, 2)
  } finally { reopened.close() }
})

test('截止日期按北京时间处理，不能识别的日期不猜测', () => {
  assert.equal(deadlineTimestamp('2099年10月20日 12:00'), Date.parse('2099-10-20T12:00:00+08:00'))
  assert.equal(deadlineTimestamp('2099-10-20'), Date.parse('2099-10-20T23:59:59+08:00'))
  assert.equal(deadlineTimestamp('10月20日 12:00', Date.parse('2026-10-15T00:00:00+08:00')), Date.parse('2026-10-20T12:00:00+08:00'))
  assert.equal(deadlineTimestamp('2099-02-30'), null)
  assert.equal(deadlineTimestamp('待确认'), null)
  assert.equal(deadlineTimestamp('明天晚上'), null)
})

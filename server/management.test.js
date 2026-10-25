import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from './index.js'
import { createAuthStore } from './auth.js'
import { createEventStore, validatePublication } from './events.js'
import { participantsCSV } from './activity-management.js'
import { activityDate, emptyFilters, matchesActivity } from '../src/utils/eventFilters.ts'

const input = { title: '管理功能测试', type: '讲座', time: '2099-10-26 19:00', deadline: '2099-10-20 12:00', location: '科学会堂', audience: '全校同学', description: '测试通知', maxParticipants: 3 }

test('QQ 群号选填、格式校验、保存编辑及群号变更通知', () => {
  assert.equal(validatePublication(input).qqGroup, '')
  assert.equal(validatePublication({ ...input, qqGroup: ' 123456789 ' }).qqGroup, '123456789')
  for (const qqGroup of [123456, {}, '1234', '1234567890123', 'https://example.com', '123 456']) {
    assert.throws(() => validatePublication({ ...input, qqGroup }), /QQ 群号/)
  }
  const store = createEventStore(':memory:')
  try {
    const event = validatePublication(input)
    delete event.qqGroup // 模拟新增字段之前的旧活动。
    store.publishByUser(event, 'owner')
    store.register(event.id, 'student')
    store.updateByUser(event.id, 'owner', validatePublication(input))
    assert.equal(store.notifications('student').length, 0)
    store.updateByUser(event.id, 'owner', validatePublication({ ...input, qqGroup: '123456789' }))
    assert.equal(store.list()[0].qqGroup, '123456789')
    assert.equal(store.lookup([event.id])[0].qqGroup, '123456789')
    assert.equal(store.ownedByUser('owner')[0].qqGroup, '123456789')
    assert.match(store.notifications('student')[0].body, /QQ 群号：未填写 → 123456789/)
    assert.throws(() => store.updateByUser(event.id, 'other', validatePublication(input)), /管理权限/)
    store.updateByUser(event.id, 'owner', validatePublication({ ...input, qqGroup: '' }))
    assert.equal(store.list()[0].qqGroup, '')
    assert.match(store.notifications('student')[0].body, /123456789 → 未填写/)
  } finally { store.close() }
})

test('名单权限、CSV导出、编辑容量保护、取消原因、通知隔离及已读', async context => {
  const authStore = createAuthStore(':memory:')
  const eventStore = createEventStore(':memory:')
  const users = await Promise.all(['2026990001', '2026990002', '2026990003', '2026990004'].map(id => authStore.register(id, 'TestOnly!123')))
  const cookies = users.map(user => `ccnu_session=${authStore.issueSession(user.id)}`)
  const event = validatePublication(input)
  eventStore.publishByUser(event, users[0].id)
  eventStore.register(event.id, users[1].id)
  eventStore.register(event.id, users[2].id)
  const server = createApp({ authStore, eventStore }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { await new Promise(resolve => server.close(resolve)); authStore.close(); eventStore.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, index, method = 'GET', body, origin) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(index !== undefined ? { Cookie: cookies[index] } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, data: await response.json() }
  }
  const path = `/api/events/${event.id}`
  assert.equal((await request(path + '/participants')).status, 401)
  assert.equal((await request(path + '/participants', 1)).status, 404)
  assert.equal((await request(path + '/participants?format=csv', 1)).status, 404)
  const roster = (await request(path + '/participants', 0)).data.participants
  assert.deepEqual(roster.map(item => item.studentId).sort(), ['2026990002', '2026990003'])
  assert.deepEqual(Object.keys(roster[0]).sort(), ['registeredAt', 'studentId'])
  const csv = await fetch(base + path + '/participants?format=csv', { headers: { Cookie: cookies[0] } })
  assert.equal(csv.status, 200)
  assert.match(csv.headers.get('content-type'), /text\/csv/)
  assert.match(csv.headers.get('content-disposition'), /attachment/)
  const csvText = await csv.text()
  assert.match(csvText, /2026990002/)
  assert.doesNotMatch(csvText, /password|salt|session|userId/)
  assert.equal((await request(path, 1, 'PUT', input)).status, 404)
  assert.equal((await request(path, 0, 'PUT', input, 'https://other.example')).status, 403)
  assert.equal((await request(path, 0, 'PUT', { ...input, maxParticipants: 1 })).status, 409)
  assert.equal((await request(path, 0, 'PUT', { ...input, title: '' })).status, 400)
  assert.equal((await request('/api/notifications', 1)).data.notifications.length, 0)
  const edited = await request(path, 0, 'PUT', { ...input, location: '新图书馆', maxParticipants: 2, qqGroup: '123456789' })
  assert.equal(edited.status, 200)
  assert.equal(edited.data.event.id, event.id)
  assert.equal(edited.data.event.registeredCount, 2)
  assert.equal(edited.data.event.qqGroup, '123456789')
  assert.equal((await request('/api/events')).data.events[0].qqGroup, '123456789')
  const notices = (await request('/api/notifications', 1)).data.notifications
  assert.equal(notices.length, 1)
  assert.match(notices[0].body, /科学会堂 → 新图书馆/)
  assert.equal((await request('/api/notifications', 3)).data.notifications.length, 0)
  assert.equal((await request('/api/notifications')).status, 401)
  assert.equal((await request(`/api/notifications/${notices[0].id}/read`, 3, 'POST', {})).status, 404)
  assert.equal((await request(`/api/notifications/${notices[0].id}/read`, 1, 'POST', {})).status, 200)
  assert.ok((await request('/api/notifications', 1)).data.notifications[0].readAt)
  // Unchanged saves must not send duplicate messages.
  await request(path, 0, 'PUT', { ...input, location: '新图书馆', maxParticipants: 2, qqGroup: '123456789' })
  assert.equal((await request('/api/notifications', 1)).data.notifications.length, 1)
  assert.equal((await request(path + '/cancel', 0, 'POST', { reason: ' ' })).status, 400)
  assert.equal((await request(path + '/cancel', 1, 'POST', { reason: '恶意取消' })).status, 404)
  assert.equal((await request(path + '/cancel', 0, 'POST', { reason: '场地维修，活动取消' })).status, 200)
  assert.equal((await request(path + '/cancel', 0, 'POST', { reason: '再次取消' })).status, 409)
  assert.equal((await request(path, 0, 'PUT', input)).status, 409)
  assert.equal((await request(path + '/registration', 3, 'POST', {})).status, 409)
  assert.equal((await request('/api/events')).data.events.length, 0)
  const saved = (await request('/api/registrations', 1)).data.events[0]
  assert.equal(saved.withdrawn, true)
  assert.equal(saved.cancellationReason, '场地维修，活动取消')
  const mine = (await request('/api/my-publications', 0)).data.events[0]
  assert.equal(mine.withdrawn, true)
  assert.equal((await request(path + '/participants', 0)).data.participants.length, 2)
  assert.match((await request('/api/notifications', 1)).data.notifications[0].body, /场地维修/)
  await request('/api/notifications/read-all', 1, 'POST', {})
  assert.ok((await request('/api/notifications', 1)).data.notifications.every(item => item.readAt))
})

test('旧库无损迁移、通知持久化与截止提醒去重', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ccnu-management-')), 'test.sqlite')
  const legacy = new DatabaseSync(path)
  legacy.exec('CREATE TABLE events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL)')
  const event = validatePublication(input)
  legacy.prepare('INSERT INTO events VALUES(?,?,?)').run(event.id, JSON.stringify(event), Date.now())
  legacy.close()
  let store = createEventStore(path)
  assert.equal(store.list()[0].title, input.title)
  const upcoming = validatePublication({ ...input, deadline: new Date(Date.now() + 12 * 3600000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16) })
  store.publishByUser(upcoming, 'publisher')
  store.register(upcoming.id, 'student')
  assert.equal(store.notifications('student').length, 1)
  const id = store.notifications('student')[0].id
  assert.equal(store.notifications('student').length, 1)
  assert.equal(store.notifications('other').length, 0)
  store.readNotification(id, 'student')
  store.close()
  store = createEventStore(path)
  try {
    assert.equal(store.notifications('student').length, 1)
    assert.ok(store.notifications('student')[0].readAt)
    store.cancelByUser(upcoming.id, 'publisher', '天气原因')
    assert.equal(store.notifications('student').length, 2)
    assert.equal(store.myRegistrations('student')[0].cancellationReason, '天气原因')
  } finally { store.close() }
})

test('CSV 防公式注入、引号及换行转义，中文 BOM', () => {
  const csv = participantsCSV([{ studentId: '=1+2', registeredAt: 0 }, { studentId: '"x,\ny"', registeredAt: 0 }])
  assert.equal(csv.charCodeAt(0), 0xFEFF)
  assert.match(csv, /"'=1\+2"/)
  assert.match(csv, /""x,\ny""/)
})

test('搜索：类型关键词、日期边界、未知日期、剩余名额与不限额区分', () => {
  const event = { ...validatePublication(input), registeredCount: 2 }
  assert.equal(matchesActivity(event, { ...emptyFilters, category: '讲座', query: '管理 科学', startDate: '2099-10-26', endDate: '2099-10-26', minSlots: '1' }), true)
  assert.equal(matchesActivity(event, { ...emptyFilters, category: '赛事' }), false)
  assert.equal(matchesActivity(event, { ...emptyFilters, minSlots: '2' }), false)
  assert.equal(matchesActivity({ ...event, registeredCount: 3 }, { ...emptyFilters, availability: 'full' }), true)
  assert.equal(matchesActivity({ ...event, registeredCount: 3 }, { ...emptyFilters, availability: 'available' }), false)
  assert.equal(matchesActivity({ ...event, maxParticipants: null }, { ...emptyFilters, availability: 'unlimited' }), true)
  assert.equal(matchesActivity({ ...event, maxParticipants: null }, { ...emptyFilters, minSlots: '1' }), false)
  assert.equal(matchesActivity({ ...event, registeredCount: undefined }, { ...emptyFilters, availability: 'available' }), false)
  assert.equal(matchesActivity({ ...event, time: '下周五' }, { ...emptyFilters, startDate: '2099-01-01' }), false)
  assert.equal(matchesActivity({ ...event, withdrawn: true }, emptyFilters), false)
  assert.equal(activityDate('2099年10月26日 19:00'), '2099-10-26')
  assert.equal(activityDate('2099-02-30'), null)
  assert.equal(activityDate('10月26日', 2026), '2026-10-26')
})

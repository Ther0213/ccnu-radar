import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createApp } from './index.js'
import { createEventStore, validatePublication } from './events.js'
import { clientAddress } from './client-address.js'
import { mergeSavedActivities } from '../src/utils/savedActivities.ts'
import { currentCardRegistration } from '../src/utils/cardRegistration.ts'
import { getMyEvents, saveMyEvents, removeMyEvent } from '../src/services/storage.ts'

const input = { title: '回归测试活动', type: '讲座', time: '2099-10-26 19:00', deadline: '2099-10-20 12:00', location: '原会场', audience: '全校同学', description: '独立测试，不写正式数据库。', maxParticipants: 5 }

test('代理地址：明确选择提供商、仅信任回环代理、ngrok 取最后有效 IP', () => {
  const req = (headers, remoteAddress = '127.0.0.1') => ({ socket: { remoteAddress }, get: name => headers[name] })
  assert.equal(clientAddress(req({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '203.0.113.2' })), '127.0.0.1')
  assert.equal(clientAddress(req({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '192.0.2.1, 203.0.113.2' }), 'ngrok'), '203.0.113.2')
  assert.equal(clientAddress(req({ 'x-forwarded-for': '192.0.2.1, unknown' }), 'ngrok'), '127.0.0.1')
  assert.equal(clientAddress(req({ 'x-forwarded-for': 'fe80::1%eth0' }), 'ngrok'), '127.0.0.1')
  assert.equal(clientAddress(req({ 'cf-connecting-ip': 'invalid' }), 'cloudflare'), '127.0.0.1')
  assert.equal(clientAddress(req({ 'cf-connecting-ip': '203.0.113.1' }), 'cloudflare'), '203.0.113.1')
  assert.equal(clientAddress(req({ 'x-forwarded-for': '203.0.113.2' }, '198.51.100.1'), 'ngrok'), '198.51.100.1')
  assert.equal(clientAddress(req({ 'x-forwarded-for': '::ffff:203.0.113.2' }), 'ngrok'), '203.0.113.2')
})

test('HTTP 登录限流：伪造 CF 和 XFF 前缀不能重置额度，不同真实来源独立计数', async context => {
  const servers = []
  context.after(async () => { for (const server of servers) await new Promise(resolve => server.close(resolve)) })
  for (const tunnelProvider of ['none', 'ngrok']) {
    const server = createApp({ authStore: {}, eventStore: {}, tunnelProvider }).listen(0, '127.0.0.1')
    servers.push(server); await once(server, 'listening')
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`
    const post = async headers => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' })
      await response.text()
      return response.status
    }
    for (let i = 0; i < 20; i++) assert.equal(await post({ 'cf-connecting-ip': `192.0.2.${i + 1}`, 'x-forwarded-for': `192.0.2.${i + 1}, 203.0.113.9` }), 400)
    assert.equal(await post({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }), 429)
    const status = await post({ 'x-forwarded-for': '203.0.113.10' })
    assert.equal(status, tunnelProvider === 'ngrok' ? 400 : 429)
  }
})

test('保存信息同步接口：修改、取消、实时名额、隐私字段和未知 ID', async context => {
  const store = createEventStore(':memory:')
  const event = validatePublication(input)
  store.publishByUser(event, 'publisher')
  store.register(event.id, 'student')
  store.updateByUser(event.id, 'publisher', validatePublication({ ...input, location: '新会场' }))
  const server = createApp({ eventStore: store }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { await new Promise(resolve => server.close(resolve)); store.close() })
  const url = `http://127.0.0.1:${server.address().port}/api/events/saved`
  const post = async (body, origin) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  const first = await post({ ids: [event.id, event.id, 'private-mock'] })
  assert.equal(first.status, 200)
  assert.equal(first.data.events.length, 1)
  assert.equal(first.data.events[0].location, '新会场')
  assert.equal(first.data.events[0].registeredCount, 1)
  assert.doesNotMatch(JSON.stringify(first.data), /owner_user_id|owner_hash|studentId|userId|publisher/)
  store.cancelByUser(event.id, 'publisher', '场地维修')
  const cancelled = (await post({ ids: [event.id] })).data.events[0]
  assert.equal(cancelled.withdrawn, true)
  assert.equal(cancelled.cancellationReason, '场地维修')
  assert.equal(cancelled.location, '新会场')
  assert.equal((await post({ ids: [] })).data.events.length, 0)
  assert.equal((await post({ ids: [3] })).status, 400)
  assert.equal((await post({ ids: Array(101).fill('x') })).status, 400)
  assert.equal((await post({ ids: [event.id] }, 'https://other.example')).status, 403)
})

test('localStorage 同步保留顺序和私有解析，移除后不复活，刷新仍保留取消和名额', context => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const memory = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } })
  context.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  const original = validatePublication(input)
  const mock = { ...original, id: 'private-mock' }
  const update = { ...original, location: '新会场', registeredCount: 2, withdrawn: true, cancellationReason: '场地维修', qqGroup: '123456789' }
  const unrelated = { ...original, id: 'not-saved' }
  saveMyEvents([mock, original])
  const merged = mergeSavedActivities(getMyEvents(), [update, unrelated])
  assert.deepEqual(merged.map(event => event.id), [mock.id, original.id])
  assert.equal(merged[0].location, '原会场')
  saveMyEvents(merged)
  const restored = getMyEvents()[1]
  assert.equal(restored.location, '新会场')
  assert.equal(restored.registeredCount, 2)
  assert.equal(restored.withdrawn, true)
  assert.equal(restored.cancellationReason, '场地维修')
  assert.equal(restored.qqGroup, '123456789')
  assert.equal(getMyEvents()[0].qqGroup, '')
  assert.deepEqual(mergeSavedActivities(removeMyEvent(original.id), [update]).map(event => event.id), [mock.id])
  assert.equal(mergeSavedActivities([mock], [])[0], mock)
})

test('卡片名额：报名即时状态有效，父级刷新后旧缓存不能覆盖新名额与人数上限', () => {
  const event = { ...validatePublication(input), registeredCount: 1 }
  const info = { eventId: event.id, registeredCount: 2, maxParticipants: 5 }
  const snapshot = { event, info }
  assert.equal(currentCardRegistration(event, snapshot), info)
  const refreshed = { ...event, registeredCount: 3, maxParticipants: 4 }
  assert.equal(currentCardRegistration(refreshed, snapshot), null)
  assert.equal(currentCardRegistration(refreshed, snapshot)?.registeredCount ?? refreshed.registeredCount, 3)
  assert.equal(currentCardRegistration(refreshed, snapshot)?.maxParticipants ?? refreshed.maxParticipants, 4)
  assert.equal(currentCardRegistration(refreshed, null), null)
})

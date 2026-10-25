import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePageHash, pageHash } from '../src/utils/navigation.ts'
import { noticeDeadline, eventState, eventSource, markPublished } from '../src/utils/eventPresentation.ts'
import { upcomingPublishedEvents } from '../src/utils/homeEvents.ts'
import { getActivityCatalog, getCurrentUser, getMyPublications, publishEvent, parseEventWithAI } from '../src/services/api.ts'
import { getMyRegistrations } from '../src/services/registrations.ts'
import { deadlineTimestamp } from './registrations.js'

const now = Date.parse('2026-10-16T10:00:00+08:00')
const event = { id: 'actual-event', title: '校园讲座', type: '讲座', time: '2026-10-20 19:00', deadline: '2026-10-19 12:00', location: '科学会堂', audience: '全校学生', description: '测试通知', summary: '测试摘要', recommendation: '测试建议', urgency: '测试提醒', maxParticipants: 10, registeredCount: 2, source: 'published' }

test('所有页面地址可往返解析，刷新初值和旧锚点兼容', () => {
  for (const page of ['home', 'parser', 'activities', 'search', 'publish', 'publications', 'auth', 'registrations', 'notifications']) assert.equal(parsePageHash(pageHash(page)).page, page)
  assert.deepEqual(parsePageHash('#events'), { page: 'home', section: 'events' })
  assert.deepEqual(parsePageHash(pageHash('home', 'events')), { page: 'home', section: 'events' })
  assert.deepEqual(parsePageHash(''), { page: 'home', section: null })
  assert.equal(parsePageHash('#/not-a-page').page, 'home')
  assert.equal(parsePageHash('#/search?section=events').section, null)
})

test('活动来源明确，不把未发布解析误认成真实报名活动', () => {
  assert.equal(eventSource(event), 'published')
  assert.equal(eventSource({ ...event, source: undefined, id: 'innovation' }), 'demo')
  assert.equal(eventSource({ ...event, source: undefined }), 'local')
  assert.equal(eventSource(markPublished({ ...event, source: 'demo' })), 'published')
  assert.equal(eventState({ ...event, source: 'demo' }, now).label, '演示')
  assert.equal(eventState({ ...event, source: 'local' }, now).label, '未发布')
})

test('状态优先级：取消 > 截止 > 满员 > 开放，未知截止不猜测', () => {
  assert.equal(eventState(event, now).label, '报名中')
  assert.equal(eventState({ ...event, registeredCount: 10 }, now).label, '已满员')
  assert.equal(eventState({ ...event, deadline: '2026-10-15', registeredCount: 10 }, now).label, '已截止')
  assert.equal(eventState({ ...event, withdrawn: true, deadline: '2026-10-15', registeredCount: 10 }, now).label, '已取消')
  assert.equal(eventState({ ...event, deadline: '待确认' }, now).label, '截止待确认')
  assert.equal(eventState({ ...event, registeredCount: undefined }, now).label, '名额待确认')
  assert.equal(eventState({ ...event, maxParticipants: null }, now).label, '报名中')
  assert.equal(eventState({ ...event, deadline: '2026-10-16 10:00' }, now).label, '已截止')
})

test('前后端支持的截止日期和北京时间边界保持一致', () => {
  for (const text of ['2026-10-16 10:00', '2026年10月16日 10:00', '10月16日 10:00之前', '2026/10/16', '2026-10-16', '2026-02-30', '下周五', '待确认', '2026-10-16 24:00']) assert.equal(noticeDeadline(text, now), deadlineTimestamp(text, now), text)
})

test('首页仅展示近期已发布活动，按日期排序，排除演示、未发布、取消和过往活动', () => {
  const items = [{ ...event, id: 'unknown', time: '待确认' }, { ...event, id: 'later', time: '2026-11-01' }, { ...event, id: 'near', time: '10月17日 19:00' }, { ...event, id: 'today', time: '2026-10-16' }, { ...event, id: 'old', time: '2026-10-15' }, { ...event, id: 'cancelled', withdrawn: true }, { ...event, id: 'demo', source: 'demo' }, { ...event, id: 'local', source: 'local' }]
  assert.deepEqual(upcomingPublishedEvents(items, now).map(item => item.id), ['today', 'near', 'later', 'unknown'])
  assert.equal(upcomingPublishedEvents(items, now, 2).length, 2)
  assert.equal(upcomingPublishedEvents([], now).length, 0)
})

test('旧后端响应也补齐来源；账号响应不受活动标识影响，AI 解析不伪装成发布', async context => {
  const previous = globalThis.fetch
  let payload
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
  context.after(() => { globalThis.fetch = previous })
  payload = { user: { id: 'test-user', studentId: '2026000001', onboardingCompleted: true } }
  assert.equal((await getCurrentUser()).id, 'test-user')
  const legacy = { ...event }; delete legacy.source
  payload = { events: [legacy], withdrawnIds: ['cancelled'] }
  assert.equal((await getActivityCatalog()).events[0].source, 'published')
  assert.equal((await getMyPublications())[0].source, 'published')
  assert.equal((await getMyRegistrations())[0].source, 'published')
  payload = { event: legacy }
  assert.equal((await publishEvent(legacy)).source, 'published')
  assert.equal((await parseEventWithAI('这是测试通知，不会真的调用 API')).source, 'local')
})

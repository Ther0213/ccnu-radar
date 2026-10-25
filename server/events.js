import { DatabaseSync } from 'node:sqlite'
import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRegistrationStore } from './registrations.js'
import { createActivityManagement } from './activity-management.js'

const types = ['赛事', '讲座', '志愿服务', '社团活动', '校园活动']
const limits = { title: 100, time: 100, deadline: 100, location: 150, audience: 150, description: 2000 }
export const hashPublisherToken = (token) => createHash('sha256').update(token).digest('hex')

export function validatePublication(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写活动信息。')
  const event = {}
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > limit) throw new Error('活动字段不能为空或超过长度限制。')
    event[field] = input[field].trim()
  }
  if (!types.includes(input.type)) throw new Error('请选择有效的活动类型。')
  const capacity = input.maxParticipants
  if (capacity != null && (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > 100000)) throw new Error('人数上限须为 1–100000 的整数，或留空。')
  if (input.qqGroup != null && typeof input.qqGroup !== 'string') throw new Error('QQ 群号须为 5–12 位数字，或留空。')
  const qqGroup = input.qqGroup?.trim() ?? ''
  if (qqGroup && !/^[0-9]{5,12}$/.test(qqGroup)) throw new Error('QQ 群号须为 5–12 位数字，或留空。')
  event.qqGroup = qqGroup
  event.maxParticipants = capacity ?? null
  event.type = input.type
  event.id = randomUUID()
  event.summary = `“${event.title}”为${event.type.endsWith('活动') ? event.type : `${event.type}活动`}，面向${event.audience}。`
  event.recommendation = '请确认活动时间、地点和参与要求后再报名。'
  event.urgency = event.deadline === '待确认' ? '暂无截止提醒' : `请注意报名截止时间：${event.deadline}`
  return event
}

export function createEventStore(path) {
  const database = new DatabaseSync(path)
  database.exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL)')
  const columns = database.prepare('PRAGMA table_info(events)').all().map(column => column.name)
  if (!columns.includes('owner_hash')) database.exec('ALTER TABLE events ADD COLUMN owner_hash TEXT')
  if (!columns.includes('withdrawn')) database.exec('ALTER TABLE events ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0')
  if (!columns.includes('owner_user_id')) database.exec('ALTER TABLE events ADD COLUMN owner_user_id TEXT')
  const registrations = createRegistrationStore(database)
  const management = createActivityManagement(database)
  const hydrate = row => {
    const event = JSON.parse(row.payload)
    return { ...event, maxParticipants: event.maxParticipants ?? null, registeredCount: registrations.registrationCount(event.id) }
  }
  return {
    ...registrations,
    ...management,
    lookup: ids => ids.length ? database.prepare(`SELECT payload, withdrawn, cancellation_reason FROM events WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(row => ({ ...hydrate(row), withdrawn: Boolean(row.withdrawn), cancellationReason: row.cancellation_reason })) : [],
    list: () => database.prepare('SELECT payload FROM events WHERE withdrawn = 0 ORDER BY created_at DESC, rowid DESC').all().map(hydrate),
    withdrawnIds: () => database.prepare('SELECT id FROM events WHERE withdrawn = 1').all().map(row => row.id),
    owned: (token) => database.prepare('SELECT payload FROM events WHERE owner_hash = ? AND withdrawn = 0 ORDER BY created_at DESC, rowid DESC').all(hashPublisherToken(token)).map(row => JSON.parse(row.payload)),
    ownedByUser: userId => database.prepare('SELECT payload, withdrawn, cancellation_reason FROM events WHERE owner_user_id = ? ORDER BY withdrawn ASC, created_at DESC, rowid DESC').all(userId).map(row => ({ ...hydrate(row), withdrawn: Boolean(row.withdrawn), cancellationReason: row.cancellation_reason })),
    publishByUser: (event, userId) => { database.prepare('INSERT INTO events (id, payload, created_at, owner_user_id) VALUES (?, ?, ?, ?)').run(event.id, JSON.stringify(event), Date.now(), userId); return event },
    withdrawByUser: (id, userId) => database.prepare('UPDATE events SET withdrawn = 1 WHERE id = ? AND owner_user_id = ? AND withdrawn = 0').run(id, userId).changes === 1,
    claimLegacy: (token, userId) => database.prepare('UPDATE events SET owner_user_id = ?, owner_hash = NULL WHERE owner_hash = ? AND owner_user_id IS NULL').run(userId, hashPublisherToken(token)).changes,
    publish: (event, token) => { database.prepare('INSERT INTO events (id, payload, created_at, owner_hash) VALUES (?, ?, ?, ?)').run(event.id, JSON.stringify(event), Date.now(), token ? hashPublisherToken(token) : null); return event },
    withdraw: (id, token) => database.prepare('UPDATE events SET withdrawn = 1 WHERE id = ? AND owner_hash = ? AND withdrawn = 0').run(id, hashPublisherToken(token)).changes === 1,
    close: () => database.close(),
  }
}

let store
export function getEventStore() {
  if (!store) {
    mkdirSync(fileURLToPath(new URL('./data/', import.meta.url)), { recursive: true })
    store = createEventStore(fileURLToPath(new URL('./data/events.sqlite', import.meta.url)))
  }
  return store
}

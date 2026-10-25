import { randomUUID } from 'node:crypto'
import { deadlineTimestamp, RegistrationError } from './registrations.js'

export function createActivityManagement(db) {
  const columns = db.prepare('PRAGMA table_info(events)').all().map(column => column.name)
  if (!columns.includes('cancellation_reason')) db.exec("ALTER TABLE events ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT ''")
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_id TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER
  ); CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at)`)
  const notify = (userId, eventId, title, body, id = randomUUID()) => {
    db.prepare('INSERT OR IGNORE INTO notifications (id,user_id,event_id,title,body,created_at) VALUES (?,?,?,?,?,?)').run(id, userId, eventId, title, body, Date.now())
  }
  const owned = (id, userId) => {
    const row = db.prepare('SELECT * FROM events WHERE id=? AND owner_user_id=?').get(id, userId)
    if (!row) throw new RegistrationError(404, '活动不存在或你没有管理权限。')
    return row
  }
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE')
    try { const value = action(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const recipients = id => db.prepare('SELECT user_id FROM registrations WHERE event_id=?').all(id)
  return {
    participants: (id, userId) => {
      owned(id, userId)
      return db.prepare('SELECT user_id AS userId, created_at AS registeredAt FROM registrations WHERE event_id=? ORDER BY created_at, rowid').all(id)
    },
    updateByUser: (id, userId, input) => transaction(() => {
      const row = owned(id, userId)
      if (row.withdrawn) throw new RegistrationError(409, '已取消或撤回的活动不能编辑。')
      const people = recipients(id)
      if (input.maxParticipants !== null && input.maxParticipants < people.length) throw new RegistrationError(409, `人数上限不能低于已报名人数（${people.length} 人）。`)
      const before = JSON.parse(row.payload)
      const fields = { title: '名称', type: '类型', time: '时间', deadline: '报名截止', location: '地点', audience: '参与对象', description: '活动说明', maxParticipants: '人数上限', qqGroup: 'QQ 群号' }
      const comparable = (event, key) => key === 'qqGroup' ? event[key] || '' : event[key] ?? null
      const present = (event, key) => comparable(event, key) || (key === 'maxParticipants' ? '未设上限' : '未填写')
      const changes = Object.entries(fields).filter(([key]) => comparable(before, key) !== comparable(input, key)).map(([key, label]) => `${label}：${present(before, key)} → ${present(input, key)}`)
      const event = { ...input, id }
      db.prepare('UPDATE events SET payload=? WHERE id=?').run(JSON.stringify(event), id)
      if (changes.length) for (const person of people) notify(person.user_id, id, `活动信息变更：${event.title}`, changes.join('\n'))
      return { ...event, registeredCount: people.length }
    }),
    cancelByUser: (id, userId, reason) => transaction(() => {
      const row = owned(id, userId)
      if (row.withdrawn) throw new RegistrationError(409, '活动已取消或撤回，请刷新列表。')
      db.prepare('UPDATE events SET withdrawn=1, cancellation_reason=? WHERE id=?').run(reason, id)
      for (const person of recipients(id)) notify(person.user_id, id, `活动已取消：${JSON.parse(row.payload).title}`, `取消原因：${reason}。报名记录保留，该活动不再接受报名。`)
    }),
    notifications: userId => transaction(() => {
      const now = Date.now()
      const rows = db.prepare('SELECT events.id, events.payload FROM registrations JOIN events ON events.id=registrations.event_id WHERE registrations.user_id=? AND events.withdrawn=0').all(userId)
      for (const row of rows) {
        const event = JSON.parse(row.payload)
        const deadline = deadlineTimestamp(event.deadline, now)
        if (deadline !== null && deadline > now && deadline - now <= 86400000) notify(userId, row.id, `报名即将截止：${event.title}`, `你已报名此活动，报名将于 ${event.deadline} 截止。此消息不要求重复报名。`, `deadline:${userId}:${row.id}:${deadline}`)
      }
      return db.prepare('SELECT id,event_id AS eventId,title,body,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 200').all(userId)
    }),
    readNotification: (id, userId) => db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').run(Date.now(), id, userId).changes === 1,
    readAllNotifications: userId => db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(Date.now(), userId),
  }
}

// Quoting alone does not stop spreadsheet formula injection.
export function participantsCSV(people) {
  const cell = value => {
    let text = String(value)
    if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + [['学号', '报名时间（北京时间）'], ...people.map(person => [person.studentId, new Date(person.registeredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })])].map(row => row.map(cell).join(',')).join('\r\n')
}

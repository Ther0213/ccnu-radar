export class RegistrationError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// Interpret supported notice dates in China Standard Time. Unknown formats stay unknown.
export function deadlineTimestamp(value, now = Date.now()) {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\s*(之前|前)$/, '')
  const match = text.match(/^(?:(\d{4})[-/年])?\s*(\d{1,2})[-/月]\s*(\d{1,2})日?(?:[T\s·]+(\d{1,2})[:：](\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const year = Number(match[1] || new Date(now + 8 * 3600000).getUTCFullYear())
  const month = Number(match[2]), day = Number(match[3])
  const hour = match[4] === undefined ? 23 : Number(match[4])
  const minute = match[5] === undefined ? 59 : Number(match[5])
  const second = match[6] === undefined ? (match[4] === undefined ? 59 : 0) : Number(match[6])
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null
  return local.getTime() - 8 * 3600000
}

export function createRegistrationStore(database) {
  database.exec('PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS registrations (event_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(event_id, user_id))')
  const countQuery = database.prepare('SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?')
  const count = id => Number(countQuery.get(id).total)
  const info = (id, userId, now = Date.now()) => {
    const row = database.prepare('SELECT payload, withdrawn, cancellation_reason FROM events WHERE id = ?').get(id)
    if (!row) throw new RegistrationError(404, '此活动尚未在本站发布，无法报名。')
    const event = JSON.parse(row.payload)
    const maxParticipants = Number.isInteger(event.maxParticipants) && event.maxParticipants > 0 ? event.maxParticipants : null
    const registeredCount = count(id)
    const isRegistered = Boolean(userId && database.prepare('SELECT 1 FROM registrations WHERE event_id = ? AND user_id = ?').get(id, userId))
    const deadline = deadlineTimestamp(event.deadline, now)
    const deadlinePassed = deadline !== null && deadline <= now
    const isWithdrawn = Boolean(row.withdrawn)
    const isFull = maxParticipants !== null && registeredCount >= maxParticipants
    const reason = isWithdrawn ? '活动已撤回，停止报名。' : isRegistered ? '你已报名此活动。' : !userId ? '请先在顶部登录后再报名。' : deadlinePassed ? '报名已截止。' : isFull ? '名额已满。' : ''
    return { eventId: id, maxParticipants, registeredCount, remainingSlots: maxParticipants === null ? null : Math.max(0, maxParticipants - registeredCount), isRegistered, isWithdrawn, cancellationReason: isWithdrawn ? row.cancellation_reason || '发布者已撤回活动' : '', isFull, deadlinePassed, deadlineKnown: deadline !== null, canRegister: Boolean(userId) && !isRegistered && !isWithdrawn && !deadlinePassed && !isFull, reason }
  }
  return {
    registrationInfo: info,
    registrationCount: count,
    register: (id, userId) => {
      database.exec('BEGIN IMMEDIATE')
      try {
        const current = info(id, userId)
        if (current.isWithdrawn) throw new RegistrationError(409, '活动已撤回，不能报名。')
        if (!current.isRegistered) {
          if (!current.canRegister) throw new RegistrationError(409, current.reason)
          database.prepare('INSERT INTO registrations VALUES (?, ?, ?)').run(id, userId, Date.now())
        }
        database.exec('COMMIT')
      } catch (error) { database.exec('ROLLBACK'); throw error }
      return info(id, userId)
    },
    cancelRegistration: (id, userId) => {
      info(id, userId)
      database.prepare('DELETE FROM registrations WHERE event_id = ? AND user_id = ?').run(id, userId)
      return info(id, userId)
    },
    myRegistrations: userId => database.prepare('SELECT events.payload, events.withdrawn, events.cancellation_reason FROM registrations JOIN events ON events.id = registrations.event_id WHERE registrations.user_id = ? ORDER BY registrations.created_at DESC, registrations.rowid DESC').all(userId).map(row => {
      const event = JSON.parse(row.payload)
      return { ...event, maxParticipants: event.maxParticipants ?? null, registeredCount: count(event.id), withdrawn: Boolean(row.withdrawn), cancellationReason: row.cancellation_reason || '发布者已撤回活动' }
    }),
  }
}

import { DatabaseSync } from 'node:sqlite'
import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const deriveKey = promisify(scrypt)
const hashToken = token => createHash('sha256').update(token).digest('hex')
export const sessionOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }

export function validateCredentials(body) {
  const studentId = typeof body?.studentId === 'string' ? body.studentId.trim() : ''
  const password = body?.password
  if (!/^\d{6,20}$/.test(studentId)) throw new Error('学号须为 6–20 位数字。')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || Buffer.byteLength(password) > 256) throw new Error('独立密码须为 8–128 个字符。')
  return { studentId, password }
}

export function createAuthStore(path) {
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)')
  // Existing accounts must not suddenly be treated as new registrations.
  const columns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name)
  if (!columns.includes('onboarding_completed')) db.exec('ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 1')
  const publicAccount = row => row ? { id: row.id, studentId: row.student_id, onboardingCompleted: Boolean(row.onboarding_completed) } : null
  return {
    completeOnboarding: id => {
      db.prepare('UPDATE users SET onboarding_completed=1 WHERE id=?').run(id)
      return publicAccount(db.prepare('SELECT id,student_id,onboarding_completed FROM users WHERE id=?').get(id))
    },
    publicUser: id => {
      const row = db.prepare('SELECT student_id FROM users WHERE id=?').get(id)
      return row ? { studentId: row.student_id } : null
    },
    register: async (studentId, password) => {
      const salt = randomBytes(16).toString('hex')
      const derived = await deriveKey(password, salt, 64)
      const user = { id: randomUUID(), studentId, onboardingCompleted: false }
      try { db.prepare('INSERT INTO users (id,student_id,salt,password_hash,onboarding_completed) VALUES (?, ?, ?, ?, 0)').run(user.id, studentId, salt, derived.toString('hex')) } catch (error) {
        if (String(error.code).includes('CONSTRAINT') || db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId)) {
          const duplicate = new Error('此学号已注册，请登录。'); duplicate.status = 409; throw duplicate
        }
        throw error
      }
      return user
    },
    login: async (studentId, password) => {
      const row = db.prepare('SELECT * FROM users WHERE student_id = ?').get(studentId)
      const candidate = await deriveKey(password, row?.salt || '00000000000000000000000000000000', 64)
      if (!row || !timingSafeEqual(Buffer.from(row.password_hash, 'hex'), candidate)) return null
      return publicAccount(row)
    },
    issueSession: userId => {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
      const token = randomBytes(32).toString('hex')
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), userId, Date.now() + sessionOptions.maxAge)
      return token
    },
    getUser: token => {
      if (!/^[a-f0-9]{64}$/.test(token || '')) return null
      const row = db.prepare('SELECT users.id, users.student_id, users.onboarding_completed FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), Date.now())
      return publicAccount(row)
    },
    revoke: token => { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token)) },
    close: () => db.close(),
  }
}

let store
export function getAuthStore() {
  if (!store) {
    mkdirSync(fileURLToPath(new URL('./data/', import.meta.url)), { recursive: true })
    store = createAuthStore(fileURLToPath(new URL('./data/events.sqlite', import.meta.url)))
  }
  return store
}
export function readSession(req) {
  return (req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith('ccnu_session='))?.slice('ccnu_session='.length) || ''
}

export function requireUser(req, res, next) {
  const user = getAuthStore().getUser(readSession(req))
  if (!user) return res.status(401).json({ message: '请先登录 CCNU Radar。' })
  req.user = user
  next()
}

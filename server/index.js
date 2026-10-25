import express from 'express'
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseWithDeepSeek } from './deepseek.js'
import { getEventStore, validatePublication } from './events.js'
import { getAuthStore, readSession, sessionOptions, validateCredentials } from './auth.js'
import { RegistrationError } from './registrations.js'
import { participantsCSV } from './activity-management.js'
import { clientAddress } from './client-address.js'

// Resolve relative to this file so starting from another directory is safe.
dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true })

const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001']

export function createApp({ authStore, eventStore, getAllowedOrigins = () => localOrigins, staticDirectory, secureCookies = Boolean(staticDirectory) || process.env.NODE_ENV === 'production', tunnelProvider = 'none', parseEvent = parseWithDeepSeek } = {}) {
const getAuth = () => authStore || getAuthStore()
const getEvents = () => eventStore || getEventStore()
const requireUser = (req, res, next) => {
  const user = getAuth().getUser(readSession(req))
  if (!user) return res.status(401).json({ message: '请先登录 CCNU Radar。' })
  req.user = user
  next()
}
const app = express()
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')
  next()
})
// No CORS middleware or Access-Control-Allow-Origin header is enabled.
app.use(express.json({ limit: '16kb' }))
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !getAllowedOrigins().includes(origin)) return res.status(403).json({ message: '不允许此来源操作。' })
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ message: '请使用 JSON 请求。' })
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'CCNU Radar backend running' })
})

app.get('/api/events', (_req, res) => {
  res.json({ events: getEvents().list(), withdrawnIds: getEvents().withdrawnIds() })
})

// Only retrieve requested saved snapshots, including withdrawn activities.
// These are public activity fields, never publisher or participant identities.
app.post('/api/events/saved', (req, res) => {
  const ids = req.body?.ids
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !id || id.length > 100)) return res.status(400).json({ message: '请提供最多 100 个有效活动编号。' })
  res.json({ events: getEvents().lookup([...new Set(ids)]) })
})

const publisherToken = (req) => {
  const authorization = req.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  return /^[a-f0-9-]{36}$/.test(token) ? token : null
}

const attempts = new Map()
const authLimit = (req, res, next) => {
  const now = Date.now()
  for (const [ip, value] of attempts) if (value.until <= now) attempts.delete(ip)
  const client = clientAddress(req, tunnelProvider)
  const value = attempts.get(client) || { count: 0, until: now + 15 * 60 * 1000 }
  value.count += 1; attempts.set(client, value)
  if (value.count > 20) return res.status(429).json({ message: '尝试次数过多，请 15 分钟后再试。' })
  next()
}

app.get('/api/auth/me', (req, res) => res.json({ user: getAuth().getUser(readSession(req)) }))
app.post('/api/auth/onboarding', requireUser, (req, res) => {
  // Deliberately ignore any client-supplied user ID: only this session's owner.
  const user = getAuth().completeOnboarding(req.user.id)
  if (!user) return res.status(401).json({ message: '登录已失效，请重新登录。' })
  res.json({ user })
})
for (const action of ['register', 'login']) {
  app.post(`/api/auth/${action}`, authLimit, async (req, res) => {
    let credentials
    try { credentials = validateCredentials(req.body) } catch (error) { return res.status(400).json({ message: error.message }) }
    let user
    try {
      const auth = getAuth()
      user = await auth[action](credentials.studentId, credentials.password)
      if (!user) return res.status(401).json({ message: '学号或密码不正确。' })
      const token = publisherToken(req)
      if (token) getEvents().claimLegacy(token, user.id)
      const previous = readSession(req)
      auth.revoke(previous)
      res.cookie('ccnu_session', auth.issueSession(user.id), { ...sessionOptions, secure: secureCookies })
      res.status(action === 'register' ? 201 : 200).json({ user })
    } catch (error) {
      res.status(error.status === 409 ? 409 : 500).json({ message: error.status === 409 ? error.message : '账号服务暂不可用，请稍后重试。' })
    }
  })
}
app.post('/api/auth/logout', (req, res) => {
  getAuth().revoke(readSession(req))
  res.clearCookie('ccnu_session', { ...sessionOptions, secure: secureCookies, maxAge: undefined })
  res.json({ status: 'ok' })
})

app.get('/api/my-publications', requireUser, (req, res) => {
  res.json({ events: getEvents().ownedByUser(req.user.id) })
})

app.get('/api/events/:id/participants', requireUser, (req, res) => {
  const people = getEvents().participants(req.params.id, req.user.id).map(person => ({
    studentId: getAuth().publicUser(person.userId)?.studentId || '账号已不可用', registeredAt: person.registeredAt,
  }))
  if (req.query.format === 'csv') {
    res.setHeader('Content-Disposition', 'attachment; filename="ccnu-radar-participants.csv"')
    return res.type('text/csv; charset=utf-8').send(participantsCSV(people))
  }
  res.json({ participants: people })
})

app.put('/api/events/:id', requireUser, (req, res) => {
  let event
  try { event = validatePublication(req.body) } catch (error) { return res.status(400).json({ message: error.message }) }
  res.json({ event: getEvents().updateByUser(req.params.id, req.user.id, event) })
})

app.post('/api/events/:id/cancel', requireUser, (req, res) => {
  const reason = req.body?.reason
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) return res.status(400).json({ message: '请填写 1–500 字的取消原因。' })
  getEvents().cancelByUser(req.params.id, req.user.id, reason.trim())
  res.json({ status: 'ok' })
})

app.get('/api/notifications', requireUser, (req, res) => res.json({ notifications: getEvents().notifications(req.user.id) }))
app.post('/api/notifications/read-all', requireUser, (req, res) => {
  getEvents().readAllNotifications(req.user.id)
  res.json({ status: 'ok' })
})
app.post('/api/notifications/:id/read', requireUser, (req, res) => {
  if (!getEvents().readNotification(req.params.id, req.user.id)) return res.status(404).json({ message: '通知不存在。' })
  res.json({ status: 'ok' })
})

app.get('/api/registrations', requireUser, (req, res) => {
  res.json({ events: getEvents().myRegistrations(req.user.id) })
})

app.get('/api/events/:id/registration', (req, res) => {
  const user = getAuth().getUser(readSession(req))
  res.json({ registration: getEvents().registrationInfo(req.params.id, user?.id) })
})

app.post('/api/events/:id/registration', requireUser, (req, res) => {
  res.json({ registration: getEvents().register(req.params.id, req.user.id) })
})

app.delete('/api/events/:id/registration', requireUser, (req, res) => {
  res.json({ registration: getEvents().cancelRegistration(req.params.id, req.user.id) })
})

app.delete('/api/events/:id', requireUser, (req, res) => {
  const origin = req.get('origin')
  if (origin && !getAllowedOrigins().includes(origin)) return res.status(403).json({ message: '不允许此来源撤回活动。' })
  getEvents().cancelByUser(req.params.id, req.user.id, '发布者已撤回活动，请留意后续安排')
  res.json({ status: 'ok' })
})

app.post('/api/events', requireUser, (req, res) => {
  const origin = req.get('origin')
  if (origin && !getAllowedOrigins().includes(origin)) return res.status(403).json({ message: '不允许此来源发布活动。' })
  let event
  try { event = validatePublication(req.body) } catch (error) {
    return res.status(400).json({ message: error.message })
  }
  res.status(201).json({ event: getEvents().publishByUser(event, req.user.id) })
})

const aiUsage = new Map()
let dailyAI = { until: Date.now() + 86400000, count: 0 }
let concurrentAI = 0
app.post('/api/parse', requireUser, async (req, res) => {
  // Reject browser requests from other sites; frontend uses the Vite proxy.
  const origin = req.get('origin')
  if (origin && !getAllowedOrigins().includes(origin)) {
    return res.status(403).json({ message: '不允许此来源访问解析接口。' })
  }
  const text = req.body?.text
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
    return res.status(400).json({ message: '请输入 1–5000 字的活动通知。' })
  }
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return res.status(503).json({ message: '后端尚未配置 DeepSeek API Key，请配置 server/.env 并重启后端，或使用模拟解析。' })
  const now = Date.now()
  for (const [id, usage] of aiUsage) if (usage.until <= now) aiUsage.delete(id)
  if (dailyAI.until <= now) dailyAI = { until: now + 86400000, count: 0 }
  const usage = aiUsage.get(req.user.id) || { until: now + 3600000, count: 0 }
  if (usage.count >= 5 || dailyAI.count >= 30 || concurrentAI >= 2) return res.status(429).json({ message: 'AI 演示调用额度已达上限或服务正忙，请稍后重试，或使用模拟解析。' })
  usage.count += 1; aiUsage.set(req.user.id, usage); dailyAI.count += 1; concurrentAI += 1
  try {
    const event = await parseEvent(text.trim(), key, process.env.DEEPSEEK_MODEL || 'deepseek-flash')
    res.json({ event })
  } catch (error) {
    res.status(502).json({ message: error.name === 'TimeoutError' ? 'AI 解析超时，请重试或使用模拟解析。' : 'AI 解析失败，请检查后端配置、账户余额或使用模拟解析。' })
  } finally { concurrentAI -= 1 }
})

if (staticDirectory) {
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
    next()
  })
  app.use(express.static(staticDirectory, { dotfiles: 'deny' }))
}

app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'API endpoint not found' })
})

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error)
  if (error instanceof RegistrationError) return res.status(error.status).json({ message: error.message })
  // Never return error details, request bodies, environment variables or keys.
  const status = error.type === 'entity.too.large' ? 413 : error.status === 400 ? 400 : 500
  const message = status === 413 ? 'JSON request body exceeds 16kb' : status === 400 ? 'Invalid JSON request body' : 'Internal server error'
  res.status(status).json({ status: 'error', message })
})

return app
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const port = Number(process.env.PORT || 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Backend startup failed: PORT must be an integer from 1 to 65535.')
  process.exit(1)
}


const server = createApp().listen(port, '127.0.0.1', () => {
  console.log(`CCNU Radar backend running at http://localhost:${port}`)
})
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? 'Backend startup failed: port is already in use.' : 'Backend startup failed: unable to listen on localhost.')
  process.exit(1)
})
}

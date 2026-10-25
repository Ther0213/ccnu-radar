import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './index.js'
import { createAuthStore } from './auth.js'
import { createEventStore } from './events.js'

test('分享模式：精确域名、Secure Cookie、静态文件隔离、AI 登录与限额', async context => {
  const authStore = createAuthStore(':memory:'), eventStore = createEventStore(':memory:')
  const staticDirectory = mkdtempSync(join(tmpdir(), 'ccnu-share-test-'))
  writeFileSync(join(staticDirectory, 'index.html'), '<!doctype html><title>CCNU Radar</title>')
  const origin = 'https://ccnu-test-only.trycloudflare.com'
  const previousKey = process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY = 'test-only-not-a-real-key'
  let calls = 0
  const app = createApp({ authStore, eventStore, staticDirectory, getAllowedOrigins: () => [origin], parseEvent: async () => { calls++; return { title: '测试活动' } } })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => {
    await new Promise(resolve => server.close(resolve)); authStore.close(); eventStore.close()
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, body, cookie, requestOrigin = origin) => fetch(base + path, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
  assert.equal((await fetch(base)).status, 200)
  assert.equal((await fetch(base + '/.env')).status, 404)
  assert.equal((await fetch(base + '/src/App.tsx')).status, 404)
  assert.equal((await post('/api/parse', { text: '测试' })).status, 401)
  assert.equal((await post('/api/auth/register', {}, undefined, 'https://other.example')).status, 403)
  const register = await post('/api/auth/register', { studentId: '2026109999', password: 'TestOnly!123' })
  assert.equal(register.status, 201)
  const cookie = register.headers.get('set-cookie')
  assert.match(cookie, /Secure/i)
  assert.match(cookie, /HttpOnly/i)
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/parse', { text: '测试' }, cookie.split(';')[0])).status, 200)
  assert.equal((await post('/api/parse', { text: '测试' }, cookie.split(';')[0])).status, 429)
  assert.equal(calls, 5)
})

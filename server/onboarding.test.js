import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAuthStore } from './auth.js'
import { createApp } from './index.js'
import { onboardingFailureMessage, shouldShowOnboarding } from '../src/utils/onboarding.ts'

test('旧后端或掉线时教程可暂时关闭：不伪造已完成、不跨账号、仍可手动重开', () => {
  const pending = { id: 'student-a', onboardingCompleted: false }
  assert.equal(shouldShowOnboarding(pending, null, null), true)
  assert.equal(shouldShowOnboarding(pending, null, pending.id), false)
  assert.equal(pending.onboardingCompleted, false)
  assert.equal(shouldShowOnboarding(pending, pending.id, pending.id), true)
  assert.equal(shouldShowOnboarding({ id: 'student-b', onboardingCompleted: false }, null, pending.id), true)
  assert.equal(shouldShowOnboarding(null, pending.id, null), false)
  assert.equal(shouldShowOnboarding({ ...pending, onboardingCompleted: true }, null, null), false)
  assert.match(onboardingFailureMessage(404), /重启后端/)
  assert.doesNotMatch(onboardingFailureMessage(404), /API endpoint not found/)
  assert.match(onboardingFailureMessage(401), /重新登录/)
})

test('新注册账号待引导，完成/跳过持久化，重新登录及跨会话不重复提示', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ccnu-onboarding-')), 'test.sqlite')
  let auth = createAuthStore(path)
  const user = await auth.register('2026980001', 'TestOnly!123')
  assert.equal(user.onboardingCompleted, false)
  const token = auth.issueSession(user.id)
  assert.equal(auth.getUser(token).onboardingCompleted, false)
  assert.equal((await auth.login(user.studentId, 'TestOnly!123')).onboardingCompleted, false)
  // Closing the site without completing the tutorial preserves pending state.
  auth.close(); auth = createAuthStore(path)
  assert.equal(auth.getUser(token).onboardingCompleted, false)
  assert.equal(auth.completeOnboarding(user.id).onboardingCompleted, true)
  assert.equal(auth.completeOnboarding(user.id).onboardingCompleted, true)
  auth.close(); auth = createAuthStore(path)
  try {
    assert.equal(auth.getUser(token).onboardingCompleted, true)
    assert.equal((await auth.login(user.studentId, 'TestOnly!123')).onboardingCompleted, true)
    assert.equal(auth.getUser(auth.issueSession(user.id)).onboardingCompleted, true)
    const second = await auth.register('2026980002', 'TestOnly!123')
    assert.equal(second.onboardingCompleted, false)
  } finally { auth.close() }
})

test('旧账号迁移：不自动弹教程，不改变密码和原会话', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ccnu-onboarding-legacy-')), 'test.sqlite')
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,student_id TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,password_hash TEXT NOT NULL)')
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('legacy-user', '2026980003', 'legacy-salt', 'legacy-password-hash')
  db.close()
  const auth = createAuthStore(path)
  try {
    const token = auth.issueSession('legacy-user')
    assert.equal(auth.getUser(token).onboardingCompleted, true)
    const verify = new DatabaseSync(path, { readOnly: true })
    const row = verify.prepare('SELECT salt,password_hash FROM users WHERE id=?').get('legacy-user')
    assert.equal(row.salt, 'legacy-salt')
    assert.equal(row.password_hash, 'legacy-password-hash')
    verify.close()
    assert.equal((await auth.register('2026980004', 'TestOnly!123')).onboardingCompleted, false)
  } finally { auth.close() }
})

test('教程 API：要求登录，只修改当前账号，重复完成安全且拒绝跨域', async context => {
  const auth = createAuthStore(':memory:')
  const server = createApp({ authStore: auth, eventStore: { claimLegacy: () => {} } }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  context.after(async () => { await new Promise(resolve => server.close(resolve)); auth.close() })
  const base = `http://127.0.0.1:${server.address().port}`
  const post = async (path, body, cookie, origin) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  assert.equal((await post('/api/auth/onboarding', {})).status, 401)
  const first = await post('/api/auth/register', { studentId: '2026980005', password: 'TestOnly!123' })
  assert.equal(first.status, 201)
  assert.equal(first.data.user.onboardingCompleted, false)
  const second = await auth.register('2026980006', 'TestOnly!123')
  assert.equal((await post('/api/auth/onboarding', {}, first.cookie, 'https://other.example')).status, 403)
  const done = await post('/api/auth/onboarding', { userId: second.id }, first.cookie)
  assert.equal(done.status, 200)
  assert.equal(done.data.user.id, first.data.user.id)
  assert.equal(done.data.user.onboardingCompleted, true)
  assert.equal((await auth.login(second.studentId, 'TestOnly!123')).onboardingCompleted, false)
  assert.equal((await post('/api/auth/onboarding', {}, first.cookie)).status, 200)
  const me = await (await fetch(base + '/api/auth/me', { headers: { Cookie: first.cookie } })).json()
  assert.equal(me.user.onboardingCompleted, true)
  assert.doesNotMatch(JSON.stringify(me), /password|salt|token_hash/)
})

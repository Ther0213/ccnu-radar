import { useState } from 'react'
import { authenticate, type User } from '../services/api'
import './AuthPage.css'
import { InfoDisclosure } from '../components/InfoDisclosure'

export function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <main className="auth-page"><p className="section-kicker">CCNU Radar 账号</p><h1>{mode === 'login' ? '欢迎回来' : '创建你的校园账号'}</h1><p>使用学号和 CCNU Radar 独立密码。</p><p className="auth-notice">请使用独立密码，勿用学校门户密码；学号尚未核验。</p><InfoDisclosure title="账号与身份说明"><p>本系统不代表学校官方身份认证。登录时，会将本浏览器历史管理凭证对应的旧发布绑定到此账号。</p></InfoDisclosure>
    <div className="auth-switch"><span>{mode === 'login' ? '还没有账号？' : '已有账号？'}</span><button type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setPassword(''); setConfirmation('') }}>{mode === 'login' ? '去注册' : '返回登录'}</button></div>
    <form onSubmit={async (event) => {
      event.preventDefault()
      if (busy) return
      if (mode === 'register' && password !== confirmation) { setError('两次密码输入不一致。'); return }
      setBusy(true); setError('')
      try { const user = await authenticate(mode, studentId.trim(), password); setPassword(''); setConfirmation(''); onAuthenticated(user) } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。') } finally { setBusy(false) }
    }}><fieldset disabled={busy}><label>学号<input required inputMode="numeric" pattern="[0-9]{6,20}" minLength={6} maxLength={20} autoComplete="username" value={studentId} onChange={event => setStudentId(event.target.value)} placeholder="6–20 位数字" /></label><label>独立密码<input required type="password" minLength={8} maxLength={128} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="至少 8 个字符" /></label>{mode === 'register' && <label>确认密码<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}<button className="primary-button" type="submit">{busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}</button></fieldset>{error && <p role="alert" className="parse-error">{error}</p>}</form>
  </main>
}

import { useEffect, useState } from 'react'
import { getNotifications, readNotification, type Notice } from '../services/management'
import './Management.css'
import { InfoDisclosure } from '../components/InfoDisclosure'

export function Notifications({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => getNotifications().then(notices => { if (active) { setItems(notices); setError('') } }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '读取失败。') }).finally(() => { if (active) setLoading(false) })
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [refresh])
  const mark = async (id?: string) => {
    setBusy(true); setError('')
    try { await readNotification(id); setRefresh(value => value + 1); onChanged() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败。') } finally { setBusy(false) }
  }
  return <main className="notifications-page"><p className="section-kicker">站内通知</p><h1>活动消息，不再错过</h1><p className="notification-note">查看已报名活动的变更、取消和截止提醒。</p><InfoDisclosure title="提醒方式"><p>登录后每 30 秒刷新，展示最近 200 条；不发送短信、邮件或离线推送。可识别的报名截止时间前 24 小时内，查询通知时生成一次提醒。</p></InfoDisclosure><div className="management-actions"><button type="button" disabled={loading || busy} onClick={() => { setLoading(true); setRefresh(value => value + 1); onChanged() }}>刷新通知</button><button type="button" disabled={loading || busy || !items.some(item => !item.readAt)} onClick={() => void mark()}>全部标为已读</button></div>
    {loading && <p role="status">正在读取通知…</p>}{error && <p role="alert" className="parse-error">{error}</p>}
    {!loading && !error && <p role="status">{items.filter(item => !item.readAt).length} 条未读通知</p>}
    <div className="notification-list">{items.map(item => <article key={item.id} className={`notification-item ${item.readAt ? '' : 'unread'}`}><h2>{!item.readAt && '● '}{item.title}</h2><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString('zh-CN')}</time><p>{item.body}</p>{!item.readAt && <button type="button" disabled={busy} onClick={() => void mark(item.id)}>标为已读</button>}</article>)}</div>
    {!loading && !error && !items.length && <p>暂无通知。报名活动发生变更或取消后，消息会出现在这里。</p>}
  </main>
}

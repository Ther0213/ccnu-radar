import { useEffect, useState } from 'react'
import { EventCard } from '../components/EventCard'
import { getMyRegistrations } from '../services/registrations'
import type { RegisteredEvent } from '../types/registration'
import './MyEvents.css'

export function MyRegistrations() {
  const [events, setEvents] = useState<RegisteredEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    getMyRegistrations().then(items => { if (active) { setEvents(items); setError('') } }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : '读取报名失败。')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])
  return <main className="my-events-page"><section className="my-events-header"><p className="section-kicker">我的报名</p><h1>已报名 {events.length} 个活动</h1><p>报名随账号保存，收藏不等于报名。可在详情中取消报名。</p></section>
    <button className="sample-button" type="button" disabled={loading} onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>刷新报名记录</button>
    {loading && <p role="status">正在读取报名记录…</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" className="parse-error">{error}</p>}
    {!loading && !error && (events.length ? <section className="my-events-grid" aria-label="已报名活动">{events.map(event => <EventCard event={event} key={event.id} withdrawn={event.withdrawn} onRegistrationChanged={info => {
      if (!info.isRegistered) { setEvents(items => items.filter(item => item.id !== info.eventId)); setNotice('已取消报名，名额已释放。') }
      else setEvents(items => items.map(item => item.id === info.eventId ? { ...item, registeredCount: info.registeredCount, withdrawn: info.isWithdrawn } : item))
    }} />)}</section> : <section className="my-events-empty"><h2>暂无报名记录</h2><p>在搜索页找到已发布的活动，打开详情点击“立即报名”。</p></section>)}
  </main>
}

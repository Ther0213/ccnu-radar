import { useEffect, useState } from 'react'
import { PublicationManager } from '../components/PublicationManager'
import { getMyPublications } from '../services/api'
import type { Event } from '../types/event'
import './MyEvents.css'
import { InfoDisclosure } from '../components/InfoDisclosure'

export function MyPublications({ onWithdrawn, onUpdated }: { onWithdrawn: (id: string) => void; onUpdated: (event: Event) => void }) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    getMyPublications().then(items => { if (active) { setEvents(items); setError(''); setLoading(false) } }).catch(cause => {
      if (active) { setError(cause instanceof Error ? cause.message : '读取失败'); setLoading(false) }
    })
    return () => { active = false }
  }, [refresh])
  return <main className="my-events-page"><section className="my-events-header"><p className="section-kicker">我的发布</p><h1>管理已发布活动</h1><p>查看和导出报名名单，编辑活动信息，或说明原因后取消活动。</p><p>报名名单仅发布者可见，请勿公开传播。</p><InfoDisclosure title="管理与取消说明"><p>活动绑定当前账号。编辑和取消会通知已报名同学；取消后停止报名，原报名记录和名单保留。</p></InfoDisclosure></section>
    <button className="sample-button" type="button" disabled={loading} onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>刷新列表</button>
    {loading && <p role="status">正在读取我的发布…</p>}
    {error && <p className="parse-error" role="alert">{error}</p>}
    {!loading && !error && (events.length ? <section className="publications-list" aria-label="我的发布">{events.map(event => <PublicationManager key={event.id} event={event} onUpdated={saved => { setEvents(items => items.map(item => item.id === saved.id ? saved : item)); onUpdated(saved) }} onCancelled={saved => { setEvents(items => items.map(item => item.id === saved.id ? saved : item)); onWithdrawn(saved.id) }} />)}</section> : <section className="my-events-empty"><h2>暂无可管理的发布</h2><p>使用此账号发布的新活动会出现在这里。</p></section>)}
  </main>
}

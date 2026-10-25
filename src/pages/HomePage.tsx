import type { Event } from '../types/event'
import type { PageName } from '../types/navigation'
import { demoEvents } from '../data/demoEvents'
import { EventCard } from '../components/EventCard'
import { useActivityClock } from '../hooks/useActivityClock'
import { upcomingPublishedEvents } from '../utils/homeEvents'
import { pageHash } from '../utils/navigation'

export function HomePage({ events, loading, error, onNavigate }: { events: Event[]; loading: boolean; error: string; onNavigate: (page: PageName) => void }) {
  const now = useActivityClock()
  const upcoming = upcomingPublishedEvents(events, now)
  return <main className="home-page">
    <section className="hero-section" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow"><span aria-hidden="true">✦</span> 华中师范大学校园活动平台</p><h1 id="hero-title">让校园活动，<br /><em>不再错过</em></h1><p className="hero-description">发现校园讲座、赛事与志愿服务，把感兴趣的活动变成真实参与。</p><div className="hero-actions"><button className="primary-button" type="button" onClick={() => onNavigate('search')}>发现校园活动 <span aria-hidden="true">→</span></button><a className="text-link" href={pageHash('home', 'events')}>浏览近期活动</a></div><button className="home-parser-link" type="button" onClick={() => onNavigate('parser')}>有活动通知？试试 AI 智能解析 →</button></div><div className="radar-visual" aria-hidden="true"><div className="radar-ring ring-one" /><div className="radar-ring ring-two" /><div className="radar-ring ring-three" /><div className="radar-sweep" /><div className="radar-center">CCNU<br /><strong>RADAR</strong></div><i className="radar-dot dot-one" /><i className="radar-dot dot-two" /><i className="radar-dot dot-three" /></div></section>
    <section className="intro-section" aria-label="产品介绍"><span className="intro-icon" aria-hidden="true">⌁</span><p>搜索、报名、管理通知，一站完成。<br />活动详情与名额以最新发布信息为准。</p></section>
    <section className="events-section" id="events" aria-labelledby="events-title"><div className="section-heading"><div><p className="section-kicker">来自活动发布者</p><h2 id="events-title">近期已发布活动</h2></div><button className="all-events-link search-home-link" type="button" onClick={() => onNavigate('search')}>搜索全部活动 →</button></div>
      {loading && <p role="status">正在加载已发布活动…</p>}{error && <p className="parse-error" role="alert">{error} 当前内容可能不是最新信息。</p>}
      {upcoming.length ? <><p className="section-note">按活动开始日期排列；日期待确认的活动排在后面。已发布不代表已通过学校审核。</p><div className="event-grid">{upcoming.map(event => <EventCard key={event.id} event={event} />)}</div></> : !loading && <section className="my-events-empty"><h3>{error ? '暂时无法确认近期活动' : '暂无近期已发布活动'}</h3><p>可以搜索其他活动，或发布第一场校园活动。</p><button className="sample-button" type="button" onClick={() => onNavigate('publish')}>去发布活动</button></section>}
    </section>
    <details className="home-demo-section"><summary>体验演示活动 · {demoEvents.length} 个（不可报名）</summary><p className="section-note">以下内容仅用于体验界面，不是真实发布，不开放报名。</p><div className="event-grid">{demoEvents.map(event => <EventCard key={event.id} event={{ ...event, source: 'demo' }} accent={event.accent} />)}</div></details>
  </main>
}

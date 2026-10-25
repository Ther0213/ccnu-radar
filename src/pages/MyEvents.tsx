import { EventCard } from '../components/EventCard'
import type { Event } from '../types/event'
import './MyEvents.css'
import { InfoDisclosure } from '../components/InfoDisclosure'
interface MyEventsProps { events: Event[]; onRemove: (id: string) => void; syncError?: string }
export function MyEvents({ events, onRemove, syncError }: MyEventsProps) { return <main className="my-events-page"><section className="my-events-header"><p className="section-kicker">我的活动</p><h1>已加入 {events.length} 个活动</h1><p>本机保存的活动。收藏不等于报名，报名记录请前往“我的报名”。</p><InfoDisclosure title="保存与同步说明"><p>收藏仅保存在本浏览器，不随账号或设备同步。已发布活动每 30 秒同步信息，取消后保留原因；未发布的解析记录不会被自动删除。</p></InfoDisclosure></section>{syncError && events.length > 0 && <p role="alert" className="parse-error">{syncError}</p>}{events.length ? <section className="my-events-grid" aria-label="已保存活动">{events.map((event) => <EventCard event={event} onRemove={onRemove} key={event.id} />)}</section> : <section className="my-events-empty"><span aria-hidden="true">⌁</span><h2>还没有加入活动</h2><p>前往 AI 智能解析页，解析并保存第一条校园活动通知吧。</p></section>}</main> }

import { useState } from 'react'
import { EventCard } from '../components/EventCard'
import type { Event, EventType } from '../types/event'
import './SearchEvents.css'
import { InfoDisclosure } from '../components/InfoDisclosure'
import { emptyFilters, matchesActivity, type ActivityFilters } from '../utils/eventFilters'

interface SearchEventsProps { events: Event[]; serverError?: string }
const categories: Array<EventType | '全部'> = ['全部', '赛事', '讲座', '志愿服务', '社团活动', '校园活动', '待确认']

export function SearchEvents({ events, serverError }: SearchEventsProps) {
  const [filters, setFilters] = useState<ActivityFilters>(emptyFilters)
  const { query, category, startDate, endDate, availability, minSlots } = filters
  const change = (patch: Partial<ActivityFilters>) => setFilters(current => ({ ...current, ...patch }))
  const invalidRange = Boolean(startDate && endDate && startDate > endDate)
  const invalidSlots = minSlots !== '' && (!Number.isInteger(Number(minSlots)) || Number(minSlots) < 1 || Number(minSlots) > 100000)
  const matches = invalidRange ? [] : events.filter(event => matchesActivity(event, filters))
  const reset = () => setFilters(emptyFilters)

  return <main className="search-events-page">
    <section className="search-events-hero"><p className="section-kicker">搜索活动</p><h1>找到你的校园精彩</h1><p>输入兴趣、活动名称或地点，发现想参与的活动。</p></section>
    <section className="search-controls" aria-label="搜索与筛选">
      <label htmlFor="event-search">你想找什么活动？</label>
      <div className="search-input-row"><input id="event-search" type="search" value={query} onChange={(event) => change({ query: event.target.value })} placeholder="搜索活动名称、关键词、地点或参与对象" /><button type="button" onClick={reset}>清空筛选</button></div>
      <div className="search-categories" aria-label="活动类型">{categories.map((type) => <button type="button" aria-pressed={category === type} className={category === type ? 'selected' : ''} onClick={() => change({ category: type })} key={type}>{type}</button>)}</div>
      <div className="advanced-filters"><label>活动开始日期（起）<input type="date" value={startDate} onChange={event => change({ startDate: event.target.value })} /></label><label>活动开始日期（止）<input type="date" value={endDate} onChange={event => change({ endDate: event.target.value })} /></label><label>名额状态<select value={availability} onChange={event => change({ availability: event.target.value })}><option value="all">全部状态</option><option value="available">还有名额（含未设上限）</option><option value="limited">限额且有剩余</option><option value="unlimited">未设人数上限</option><option value="full">名额已满</option></select></label><label>至少剩余名额<input type="number" min={1} max={100000} step={1} value={minSlots} placeholder="仅筛选已知的限额活动" onChange={event => change({ minSlots: event.target.value })} /></label></div>
      <InfoDisclosure title="筛选规则"><p>日期按活动开始日筛选，包含起止当天；仅含月日按今年处理，未知日期不纳入日期结果。有名额不代表报名未截止，请查看活动状态和详情。</p></InfoDisclosure>
      {invalidRange && <p role="alert" className="parse-error">开始日期不能晚于结束日期。</p>}
      {invalidSlots && <p role="alert" className="parse-error">剩余名额请输入 1–100000 的整数，或留空。</p>}
    </section>
    <div className="search-results-heading"><h2>活动搜索结果</h2><p role="status">找到 {matches.length} 个活动</p></div>
    <InfoDisclosure title="搜索范围与活动标识"><p>包含已发布活动、演示活动和本机保存的解析记录。“演示”和“未发布”不支持真实报名；“已发布”不代表经过学校审核。</p></InfoDisclosure>
    {serverError && <p role="alert" className="parse-error">{serverError} 当前仅显示已加载的活动；后端恢复后重新进入搜索页即可刷新。</p>}
    {matches.length ? <section className="event-grid" aria-label="搜索结果">{matches.map((event) => <EventCard event={event} key={event.id} />)}</section> : <section className="search-empty"><h2>暂时没有找到相关活动</h2><p>试试更短的关键词，或切换活动类型。</p><button type="button" onClick={reset}>查看全部活动</button></section>}
  </main>
}

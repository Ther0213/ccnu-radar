import type { RefObject } from 'react'
import type { Event } from '../types/event'
import { formatCapacity } from '../utils/capacity'
import { RegistrationPanel } from './RegistrationPanel'
import type { RegistrationInfo } from '../types/registration'
import './EventDetails.css'
import { ActivityBadges } from './ActivityBadges'
import { eventSource } from '../utils/eventPresentation'
import { QQGroup } from './QQGroup'

interface EventDetailsProps {
  event: Event
  dialogRef: RefObject<HTMLDialogElement | null>
  open: boolean
  onClose: () => void
  onRegistrationChanged: (info: RegistrationInfo) => void
}

const display = (value: string | undefined, fallback = '待确认') => value?.trim() && value !== '待确认' ? value : fallback

export function EventDetails({ event, dialogRef, open, onClose, onRegistrationChanged }: EventDetailsProps) {
  return <dialog className="event-details-dialog" ref={dialogRef} onClose={onClose} aria-label={`${event.title}活动详情`} onClick={(click) => {
    if (click.target === click.currentTarget) {
      const bounds = click.currentTarget.getBoundingClientRect()
      if (click.clientX < bounds.left || click.clientX > bounds.right || click.clientY < bounds.top || click.clientY > bounds.bottom) click.currentTarget.close()
    }
  }}>
    <header className="event-details-header"><div><div className="activity-badges"><span className="event-type">{event.type}</span><ActivityBadges event={event} /></div><h2>{event.title}</h2></div><button type="button" className="event-details-close" onClick={() => dialogRef.current?.close()} aria-label="关闭活动详情">关闭 ×</button></header>
    {event.withdrawn && <p role="status">活动已取消 / 撤回。原因：{event.cancellationReason || '发布者已撤回，请联系发布者确认。'}</p>}
    <dl className="event-details-fields">
      {([['活动时间', event.time], ['报名截止', event.deadline], ['活动地点', event.location], ['参与对象', event.audience], ['人数上限', formatCapacity(event.maxParticipants)]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}
    </dl>
    {eventSource(event) !== 'published' && <p className="activity-source-note">{eventSource(event) === 'demo' ? '这是演示活动，仅供体验，不开放真实报名。' : '这是未发布的解析记录，不支持报名；加入“我的活动”仅保存在当前浏览器。'}</p>}
    {open && eventSource(event) === 'published' && <RegistrationPanel key={event.id} eventId={event.id} onChanged={onRegistrationChanged} />}
    <QQGroup key={`${event.id}:${event.qqGroup ?? ''}`} value={event.qqGroup} />
    <section><h3>✨ 活动摘要</h3><p>{display(event.summary, '暂无活动摘要，请参考下方通知原文。')}</p></section>
    <section><h3>💡 参与建议</h3><p>{display(event.recommendation, '请确认活动内容、参与对象和时间安排后再决定是否参与。')}</p></section>
    <section><h3>⏰ 报名截止提醒</h3><p>{display(event.urgency, event.deadline && event.deadline !== '待确认' ? `请注意报名截止时间：${event.deadline}` : '暂无截止提醒')}</p></section>
    <section className="event-details-description"><h3>活动通知原文</h3><p>{display(event.description, '暂无活动说明。')}</p></section>
  </dialog>
}

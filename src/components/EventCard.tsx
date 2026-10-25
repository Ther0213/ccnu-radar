import type { Event } from '../types/event'
import { formatCapacity } from '../utils/capacity'
import { useRef, useState } from 'react'
import { EventDetails } from './EventDetails'
import type { RegistrationInfo } from '../types/registration'
import { currentCardRegistration, type CardRegistration } from '../utils/cardRegistration'
import './EventCard.css'
import { ActivityBadges } from './ActivityBadges'

interface EventCardProps { event: Event; accent?: string; onRemove?: (id: string) => void | Promise<void>; removeLabel?: string; confirmationMessage?: string; onRegistrationChanged?: (info: RegistrationInfo) => void; withdrawn?: boolean }

export function EventCard({ event, accent = 'green', onRemove, removeLabel = '移除活动', confirmationMessage = '从我的活动中移除？此操作不会取消实际报名。', onRegistrationChanged, withdrawn }: EventCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [removing, setRemoving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [registrationSnapshot, setRegistration] = useState<CardRegistration | null>(null)
  const registration = currentCardRegistration(event, registrationSnapshot)
  const handleRegistrationChanged = (info: RegistrationInfo) => { setRegistration({ event, info }); onRegistrationChanged?.(info) }
  const registeredCount = registration?.registeredCount ?? event.registeredCount
  const capacity = registration ? registration.maxParticipants : event.maxParticipants
  const effectiveEvent = { ...event, registeredCount, maxParticipants: capacity, withdrawn: Boolean(withdrawn || event.withdrawn || registration?.isWithdrawn), cancellationReason: registration?.cancellationReason || event.cancellationReason }
  const handleRemove = async () => {
    if (removing) return
    setRemoving(true); setRemoveError('')
    try { await onRemove?.(event.id) } catch (error) {
      setRemoveError(error instanceof Error ? error.message : '操作失败，请重试。')
    } finally { setRemoving(false) }
  }
  return <><article className={`event-card accent-${accent}`}>
    <div className="card-top"><div className="activity-badges"><span className="event-type">{event.type}</span><ActivityBadges event={effectiveEvent} /></div><span className="card-signal" aria-hidden="true">⌁</span></div>
    <h3>{event.title}</h3>
    {(withdrawn || event.withdrawn || registration?.isWithdrawn) && <p className="event-remove-error">活动已取消 / 撤回。原因：{registration?.cancellationReason || event.cancellationReason || '发布者已撤回，请联系发布者确认后续安排。'}</p>}
    <dl><div><dt>活动时间</dt><dd>{event.time}</dd></div><div><dt>报名截止</dt><dd>{event.deadline}</dd></div><div><dt>人数上限</dt><dd>{formatCapacity(capacity)}</dd></div>{typeof registeredCount === 'number' && <div><dt>报名名额</dt><dd>已报 {registeredCount} 人{capacity ? ` · 剩余 ${Math.max(0, capacity - registeredCount)}` : ''}</dd></div>}</dl>
    <div className="event-card-actions"><button type="button" onClick={() => { dialogRef.current?.showModal(); setDetailsOpen(true) }}>查看详情 <span aria-hidden="true">→</span></button>
      {onRemove && !confirmingRemoval && <button className="remove-event-button" type="button" onClick={() => setConfirmingRemoval(true)}>{removeLabel}</button>}
    </div>
    {onRemove && confirmingRemoval && <div className="event-remove-confirm"><p>{confirmationMessage}</p><div><button className="remove-event-button" type="button" disabled={removing} onClick={() => void handleRemove()}>{removing ? '处理中…' : `确认${removeLabel}`}</button><button type="button" disabled={removing} onClick={() => { setConfirmingRemoval(false); setRemoveError('') }}>取消</button></div></div>}
    {removeError && <p className="event-remove-error" role="alert">{removeError}</p>}
  </article><EventDetails event={effectiveEvent} dialogRef={dialogRef} open={detailsOpen} onClose={() => setDetailsOpen(false)} onRegistrationChanged={handleRegistrationChanged} /></>
}

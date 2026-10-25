import { useState } from 'react'
import type { Event } from '../types/event'
import { EventCard } from './EventCard'
import { ActivityForm } from './ActivityForm'
import { cancelPublication, exportParticipants, getParticipants, updatePublication, type Participant } from '../services/management'
import '../pages/Management.css'

export function PublicationManager({ event, onUpdated, onCancelled }: { event: Event; onUpdated: (event: Event) => void; onCancelled: (event: Event) => void }) {
  const [panel, setPanel] = useState<'edit' | 'people' | 'cancel' | null>(null)
  const [people, setPeople] = useState<Participant[]>([])
  const [loaded, setLoaded] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败。') } finally { setBusy(false) }
  }
  const loadPeople = () => void run(async () => { setPanel('people'); setLoaded(false); setPeople(await getParticipants(event.id)); setLoaded(true) })
  return <section className="publication-manager" aria-label={`管理${event.title}`}>
    <EventCard event={event} withdrawn={event.withdrawn} />
    <div className="management-actions"><button type="button" disabled={busy} onClick={loadPeople}>查看报名名单</button><button type="button" disabled={busy} onClick={() => void run(async () => { await exportParticipants(event.id); setNotice('名单已导出，请妥善保管同学的学号信息。') })}>导出名单 CSV</button>
      {!event.withdrawn && <><button type="button" disabled={busy} onClick={() => { setPanel('edit'); setError(''); setNotice('') }}>编辑活动</button><button type="button" className="danger-button" disabled={busy} onClick={() => { setPanel('cancel'); setError(''); setNotice('') }}>取消活动</button></>}
      {panel && <button type="button" disabled={busy} onClick={() => setPanel(null)}>收起</button>}
    </div>
    {busy && <p role="status">正在处理…</p>}{error && <p role="alert" className="parse-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {panel === 'people' && loaded && <div className="participants-panel"><h3>报名名单 · {people.length} 人</h3><p>仅发布者可见。学号为用户自行填写，尚未经学校核验。</p>{people.length ? <div className="table-scroll"><table><thead><tr><th scope="col">学号</th><th scope="col">报名时间（北京时间）</th></tr></thead><tbody>{people.map(person => <tr key={person.studentId}><td>{person.studentId}</td><td>{new Date(person.registeredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</td></tr>)}</tbody></table></div> : <p>暂无同学报名。</p>}<button type="button" disabled={busy} onClick={loadPeople}>刷新名单</button></div>}
    {panel === 'edit' && !event.withdrawn && <ActivityForm key={event.id} initial={event} submitLabel="保存修改并通知报名同学" onCancel={() => setPanel(null)} onSave={async form => {
      setBusy(true); setError('')
      try { const saved = await updatePublication(event.id, form); onUpdated(saved); setPanel(null); setNotice('活动已保存。如有信息变更，系统已通知已报名同学。') } finally { setBusy(false) }
    }} />}
    {panel === 'cancel' && !event.withdrawn && <form className="cancellation-form" onSubmit={submit => { submit.preventDefault(); void run(async () => {
      await cancelPublication(event.id, reason)
      onCancelled({ ...event, withdrawn: true, cancellationReason: reason.trim() }); setPanel(null)
      setNotice('活动已取消并停止报名，取消原因已发送给已报名同学。报名记录仍保留。')
    }) }}><h3>确认取消活动</h3><p>取消后不再公开展示、不能继续编辑或报名。已有报名记录保留，报名同学将收到站内通知。</p><label>取消原因<textarea required maxLength={500} value={reason} onChange={change => setReason(change.target.value)} disabled={busy} rows={3} /></label><button type="submit" className="danger-button" disabled={busy || !reason.trim()}>确认取消并通知报名同学</button></form>}
  </section>
}

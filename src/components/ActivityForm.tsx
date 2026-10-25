import { useState } from 'react'
import type { EventPublication } from '../services/api'
import '../pages/PublishEvent.css'

const emptyActivity: EventPublication = { title: '', type: '校园活动', time: '', deadline: '', location: '', audience: '', description: '', maxParticipants: null }
const inputs = [{ key: 'title', label: '活动名称', max: 100 }, { key: 'time', label: '活动时间（建议 YYYY-MM-DD HH:mm）', max: 100 }, { key: 'deadline', label: '报名截止时间（未知填待确认）', max: 100 }, { key: 'location', label: '活动地点', max: 150 }, { key: 'audience', label: '参与对象', max: 150 }] as const

export function ActivityForm({ initial = emptyActivity, onSave, onCancel, submitLabel = '发布活动' }: {
  initial?: EventPublication; onSave: (form: EventPublication) => Promise<void>; onCancel?: () => void; submitLabel?: string
}) {
  const [form, setForm] = useState<EventPublication>(() => ({ title: initial.title, type: initial.type, time: initial.time, deadline: initial.deadline, location: initial.location, audience: initial.audience, description: initial.description, maxParticipants: initial.maxParticipants }))
  const [qqGroup, setQqGroup] = useState(initial.qqGroup ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="publish-form" onSubmit={async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try { await onSave({ ...form, qqGroup: qqGroup.trim() }) } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败。') } finally { setBusy(false) }
  }}><fieldset disabled={busy}><legend>活动信息</legend><div className="publish-fields">
      {inputs.map(({ key, label, max }) => <label key={key}>{label}<input required maxLength={max} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label>活动类型<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as EventPublication['type'] })}>{['赛事', '讲座', '志愿服务', '社团活动', '校园活动'].map(type => <option key={type}>{type}</option>)}</select></label>
      <label>人数上限（选填）<input type="number" min={1} max={100000} step={1} value={form.maxParticipants ?? ''} placeholder="留空表示未设上限" onChange={event => setForm({ ...form, maxParticipants: event.target.value === '' ? null : Number(event.target.value) })} /></label>
      <label>活动 QQ 群号（选填）<input type="text" inputMode="numeric" pattern="[0-9]{5,12}" maxLength={12} title="请输入 5–12 位数字的 QQ 群号，或留空" value={qqGroup} onChange={event => setQqGroup(event.target.value)} placeholder="填写群号，方便同学搜索加入" /><small>群号将公开展示，请勿填写个人 QQ 号。</small></label>
    </div><label>活动说明 / 通知原文<textarea required maxLength={2000} rows={6} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
    <div className="management-actions"><button className="primary-button" type="submit">{busy ? '正在保存…' : submitLabel}</button>{onCancel && <button type="button" onClick={onCancel}>放弃修改</button>}</div>
    </fieldset>{error && <p className="parse-error" role="alert">{error}</p>}</form>
}

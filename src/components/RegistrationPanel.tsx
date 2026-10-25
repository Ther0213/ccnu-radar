import { useEffect, useEffectEvent, useState } from 'react'
import { cancelRegistration, getRegistrationInfo, registerForEvent } from '../services/registrations'
import type { RegistrationInfo } from '../types/registration'
import './RegistrationPanel.css'

export function RegistrationPanel({ eventId, onChanged }: { eventId: string; onChanged: (info: RegistrationInfo) => void }) {
  const [info, setInfo] = useState<RegistrationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const notifyChanged = useEffectEvent((result: RegistrationInfo) => onChanged(result))
  useEffect(() => {
    let active = true
    const load = () => getRegistrationInfo(eventId).then(result => { if (active) { setInfo(result); setError(''); notifyChanged(result) } }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : '无法读取名额信息。')
    }).finally(() => { if (active) setLoading(false) })
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [eventId, refresh])

  const act = async (cancel: boolean) => {
    if (busy || loading) return
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await (cancel ? cancelRegistration(eventId) : registerForEvent(eventId))
      setInfo(updated); setConfirmCancel(false)
      setNotice(cancel ? '已取消报名，名额已释放。' : '报名成功，可在“我的报名”中查看。')
      onChanged(updated)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '报名操作失败，请重试。')
      try { const current = await getRegistrationInfo(eventId); setInfo(current); onChanged(current) } catch { /* Preserve the original error. */ }
    } finally { setBusy(false) }
  }

  return <section className="registration-panel" aria-label="活动报名"><div className="registration-heading"><h3>活动报名与名额</h3><button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>刷新名额</button></div>
    {loading && <p role="status">正在查询最新名额…</p>}
    {info && <><p className="registration-numbers">已报名 <strong>{info.registeredCount}</strong> 人 · {info.remainingSlots === null ? '人数上限未注明' : <>剩余 <strong>{info.remainingSlots}</strong> 个名额（上限 {info.maxParticipants} 人）</>}</p>
      <p>{info.isWithdrawn ? `活动已取消，停止报名。原因：${info.cancellationReason || '请联系发布者确认。'}` : info.reason || '提交报名时将再次校验名额。'}</p>
      {!info.deadlineKnown && !info.isWithdrawn && <p className="registration-hint">截止时间无法自动核验，请以通知原文为准。</p>}
      {info.isRegistered ? confirmCancel ? <div className="registration-confirm"><p>确认取消报名？取消后名额会释放，之后可能无法重新抢到名额。</p><button type="button" disabled={busy || loading} onClick={() => void act(true)}>{busy ? '处理中…' : '确认取消报名'}</button><button type="button" disabled={busy} onClick={() => setConfirmCancel(false)}>保留报名</button></div> : <button type="button" disabled={busy || loading} onClick={() => setConfirmCancel(true)}>取消报名</button> : <button className="primary-button" type="button" disabled={busy || loading || !info.canRegister || Boolean(error)} onClick={() => void act(false)}>{busy ? '正在报名…' : info.isWithdrawn ? '活动已取消' : info.deadlinePassed ? '报名已截止' : info.isFull ? '名额已满' : '立即报名'}</button>}
    </>}
    {error && <p role="alert" className="registration-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}

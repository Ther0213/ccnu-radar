import { useEffect, useRef, useState } from 'react'
import './OnboardingTutorial.css'

const steps = [
  { icon: '⌕', title: '发现想参加的活动', subtitle: '从搜索开始，找到你的校园精彩', paragraphs: ['点击顶部“搜索活动”，输入活动名称、兴趣或地点。', '可以按活动类型、日期和剩余名额筛选。搜索范围也包含演示活动及本机保存的解析结果；只有后端已发布的活动支持真实报名。'] },
  { icon: '✓', title: '收藏不等于报名', subtitle: '报名成功，才会占用一个名额', paragraphs: ['打开活动详情，确认时间、地点和参与要求，再点击“立即报名”。报名成功后，在“我的报名”中查看或取消。', '“收藏 / 加入我的活动”只保存在当前浏览器，不等于报名，也不会跨账号或设备同步。已满员、已截止或已取消的活动不能新增报名。'] },
  { icon: '✦', title: '把通知变成清晰的信息', subtitle: '使用 AI 智能解析，少翻几遍通知', paragraphs: ['打开“AI智能解析”，粘贴活动通知，提取时间、地点、截止日期和参与对象，查看摘要及建议。', '可以选择模拟解析。真实解析需要登录、受演示额度限制，并会将通知发送给 DeepSeek；请勿粘贴密码或其他敏感信息。解析后仍请核对原通知，信息不足会标为“待确认”。'] },
  { icon: '↗', title: '也可以发布自己的活动', subtitle: '从发布到名单管理，一站完成', paragraphs: ['在“发布活动”填写真实信息和人数上限。在“我的发布”编辑活动、查看或导出报名名单，取消活动时需要说明原因。', '已报名活动的变更、取消和截止提醒会出现在“站内通知”，登录后每 30 秒检查一次，不发送短信或微信推送。学号为自行填写，尚未核验学校身份；请使用独立密码。'] },
]

export function OnboardingTutorial({ onFinish, onDismiss }: { onFinish: (goSearch: boolean) => Promise<void>; onDismiss: (goSearch: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [requestedSearch, setRequestedSearch] = useState(false)
  const pending = useRef(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const finish = async (goSearch: boolean) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setRequestedSearch(goSearch)
    try { await onFinish(goSearch) } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法保存教程状态，请稍后重试。')
    } finally { pending.current = false; setBusy(false) }
  }
  const current = steps[step]
  const close = () => { if (pending.current) return; if (error) onDismiss(false); else void finish(false) }
  return <dialog ref={dialog} className="onboarding-dialog" aria-labelledby="onboarding-title" aria-describedby="onboarding-subtitle" onCancel={event => { event.preventDefault(); close() }}>
    <header className="onboarding-header"><span className="section-kicker">欢迎使用 CCNU Radar</span><button type="button" disabled={busy} onClick={close} aria-label="跳过并关闭新手教程">{error ? '暂时关闭 ×' : '跳过教程 ×'}</button></header>
    <ol className="onboarding-progress" aria-label="教程步骤">{steps.map((item, index) => <li key={item.title}><button type="button" disabled={busy} aria-current={index === step ? 'step' : undefined} aria-label={`第 ${index + 1} 步：${item.title}`} onClick={() => setStep(index)}>{index < step ? '✓' : index + 1}</button></li>)}</ol>
    <section className="onboarding-content" aria-live="polite"><span className="onboarding-icon" aria-hidden="true">{current.icon}</span><p className="onboarding-counter">新手指南 · {step + 1} / {steps.length}</p><h2 id="onboarding-title">{current.title}</h2><p id="onboarding-subtitle">{current.subtitle}</p>{current.paragraphs.map(paragraph => <p key={paragraph} className="onboarding-explanation">{paragraph}</p>)}</section>
    {error && <div className="onboarding-save-error"><p role="alert" className="parse-error">{error}</p><button type="button" disabled={busy} onClick={() => onDismiss(requestedSearch)}>暂时关闭，继续使用</button><p className="onboarding-note">你的学习进度不会阻止使用网站。这里只暂时关闭弹窗，不会假装服务器已保存完成状态；后续可从“新手教程”重新保存。</p></div>}
    <footer className="onboarding-actions"><button type="button" disabled={busy || step === 0} onClick={() => setStep(value => value - 1)}>上一步</button>{step < steps.length - 1 ? <button type="button" className="primary-button" disabled={busy} onClick={() => setStep(value => value + 1)}>下一步 →</button> : <button type="button" className="primary-button" disabled={busy} onClick={() => void finish(true)}>{busy ? '正在保存…' : '完成教程，去找活动 →'}</button>}</footer>
    <p className="onboarding-note">完成或跳过后不再自动弹出。以后可从顶部“新手教程”重新查看。</p>
  </dialog>
}

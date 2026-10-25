import { useState } from 'react'
import { parseEventNotice } from '../services/parser'
import { parseEventWithAI } from '../services/api'
import type { Event } from '../types/event'
import { formatCapacity } from '../utils/capacity'
import './AIParser.css'

interface AIParserProps { onAddActivity: (event: Event) => void }

function Insight({ title, content, fallback }: { title: string; content?: string; fallback: string }) {
  const value = content?.trim()
  return <section className="smart-insight"><h4>{title}</h4><p>{value && value !== '待确认' ? value : fallback}</p></section>
}

const examples = {
  '创新创业比赛': `【CCNU 创新创业大赛】\n活动类型：竞赛\n活动时间：10月26日 14:00\n举办地点：大学生活动中心\n报名截止：10月22日 23:59\n面向全校本科生\n欢迎对创新创业感兴趣的同学报名参与。`,
  '校园讲座': `活动名称：人工智能与教育未来讲座\n活动时间：10月20日 19:00\n地点：科学会堂\n请于10月20日 12:00之前完成报名。\n参与对象：全校师生。`,
  '志愿活动': `活动主题：桂子山环保志愿服务\n类型：志愿服务\n举办时间 - 10月22日 08:30\n地址：桂子山校区\n提交时间：10月19日 18:00\n面向对象：全校学生。`,
}

export function AIParser({ onAddActivity }: AIParserProps) {
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<Event | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isAdded, setIsAdded] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState('')
  const [resultSource, setResultSource] = useState('模拟 AI 解析')
  const handleParse = async (simulate = false) => {
    if (isParsing) return
    setIsParsing(true)
    setError('')
    setResult(null)
    setIsFavorite(false)
    setIsAdded(false)
    try {
      const event = simulate ? parseEventNotice(notice) : await parseEventWithAI(notice)
      setResult(event)
      setResultSource(simulate ? '模拟 AI 解析' : 'DeepSeek AI 解析')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '解析失败，请重试。')
    } finally {
      setIsParsing(false)
    }
  }
  const handleAdd = () => {
    if (!result || isAdded) return
    try { onAddActivity(result); setIsAdded(true); setIsFavorite(true); setError('') }
    catch { setError('保存失败，请检查浏览器存储权限后重试。') }
  }

  return <main className="parser-page"><section className="parser-hero"><p className="section-kicker">AI 智能解析</p><h1>把活动通知，变成<br /><em>清晰的行动计划</em></h1><p>粘贴校园活动通知，CCNU Radar 将自动识别关键活动信息。</p></section><section className="parser-workspace"><div className="notice-panel"><div className="panel-heading"><div><h2>活动通知原文</h2><span>支持粘贴群公告、推文或通知文本</span></div></div><div className="sample-buttons" aria-label="测试示例">{Object.entries(examples).map(([name, text]) => <button className="sample-button" type="button" key={name} disabled={isParsing} onClick={() => { setNotice(text); setResult(null); setIsAdded(false); setIsFavorite(false); setError('') }}>{name}</button>)}</div><textarea disabled={isParsing} maxLength={5000} value={notice} onChange={(event) => setNotice(event.target.value)} placeholder="在此粘贴校园活动通知……\n\n例如：活动时间、报名截止、地点、参与对象等信息。" aria-label="活动通知原文" /><button className="parse-button" type="button" onClick={() => void handleParse()} disabled={isParsing || !notice.trim()}>{isParsing ? '正在解析，请稍候…' : '✦ 开始解析活动通知'}</button><button className="sample-button simulation-button" type="button" disabled={isParsing || !notice.trim()} onClick={() => void handleParse(true)}>使用模拟解析（不发送通知）</button><p className="parse-disclosure">真实解析会将通知文本发送至 DeepSeek，请勿输入密码或个人敏感信息。</p>{error && <p className="parse-error" role="alert">{error}</p>}</div><div className="result-panel"><div className="panel-heading"><div><h2>解析结果</h2><span>{result ? '已提取活动关键信息' : '等待解析活动通知'}</span></div></div>{result ? <div className="result-content"><div className="result-label"><span>{result.type}</span><span className="parsed-badge">{resultSource}</span></div><h3>{result.title}</h3><p className="result-description">{result.description}</p><dl className="result-details"><div><dt>活动时间</dt><dd>{result.time}</dd></div><div><dt>报名截止</dt><dd>{result.deadline}</dd></div><div><dt>活动地点</dt><dd>{result.location}</dd></div><div><dt>参与对象</dt><dd>{result.audience}</dd></div><div><dt>人数上限</dt><dd>{formatCapacity(result.maxParticipants)}</dd></div></dl><div className="smart-insights" aria-live="polite"><Insight title="✨ 活动智能总结" content={result.summary} fallback="通知信息不足，暂无法生成活动摘要，请补充活动名称、类型和参与对象。" /><Insight title="💡 参与建议" content={result.recommendation} fallback="建议先确认活动内容、参与对象和时间安排，再决定是否参与。" /><Insight title="⏰ 报名截止提醒" content={result.urgency} fallback="暂无截止提醒" /></div><div className="result-actions"><button className={isFavorite ? 'favorite-button favorited' : 'favorite-button'} type="button" disabled={isAdded} onClick={handleAdd}>{isFavorite ? '♥ 已收藏' : '♡ 收藏活动'}</button><button className="add-button" type="button" onClick={handleAdd} disabled={isAdded}>{isAdded ? '✓ 已加入我的活动' : '加入我的活动'}</button></div></div> : <div className="empty-result"><span>⌁</span><p>解析完成后，活动信息会显示在这里</p></div>}</div></section></main>
}

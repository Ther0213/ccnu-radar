import type { Event, EventType } from '../types/event'
import { normalizeCapacity } from '../utils/capacity'

const PENDING = '待确认'
const labels = {
  title: ['活动名称', '活动主题', '活动标题', '活动项目', '主题'],
  type: ['活动类型', '类型'],
  time: ['活动时间', '举办时间', '开始时间', '时间'],
  deadline: ['报名截止日期', '报名截止时间', '报名截止', '提交时间', '截止日期', '截止时间', '截止'],
  location: ['活动地点', '举办地点', '地点', '地址'],
  audience: ['参与对象', '面向对象', '参与人群', '招募对象', '面向'],
}

function extractLabeledValue(text: string, fieldLabels: string[]): string {
  const match = text.match(new RegExp(`(?:^|[\\n。；;])\\s*(?:${fieldLabels.join('|')})\\s*(?:为|是)?\\s*(?:[：:：-]\\s*)?([^\\n。；;]+)`, 'i'))
  return match?.[1]?.trim() || PENDING
}

function normalizeType(value: string): EventType {
  if (/讲座|报告|分享会/.test(value)) return '讲座'
  if (/志愿|公益/.test(value)) return '志愿服务'
  if (/竞赛|大赛|比赛/.test(value)) return '赛事'
  if (/社团|招新/.test(value)) return '社团活动'
  if (/活动/.test(value)) return '校园活动'
  return PENDING
}

function extractDeadline(text: string): string {
  const labeledDeadline = extractLabeledValue(text, labels.deadline)
  if (labeledDeadline !== PENDING) return labeledDeadline
  const relativeDeadline = text.match(/(?:请于|请在|务必在)?\s*(\d{1,2}月\d{1,2}日(?:\s*\d{1,2}[:：]\d{2})?)\s*(?:之前|前|截止)/)
  return relativeDeadline?.[1] || PENDING
}

function extractTitle(text: string): string {
  const labeledTitle = extractLabeledValue(text, labels.title)
  if (labeledTitle !== PENDING) return labeledTitle
  const bracketTitle = text.match(/【([^】]{2,40})】/)
  return bracketTitle?.[1]?.trim() || PENDING
}

function generateSummary(title: string, type: EventType, audience: string): string {
  if ([title, type, audience].every((value) => value === PENDING)) {
    return '通知信息不足，暂无法生成活动摘要，请补充活动名称、类型和参与对象。'
  }
  const activity = title === PENDING ? '本活动' : `“${title}”`
  const category = type === PENDING ? '，活动类型待确认' : `为${type.endsWith('活动') ? type : `${type}活动`}`
  const participants = audience === PENDING ? '参与对象待确认' : `面向${audience}开放`
  return `${activity}${category}，${participants}。`
}

function generateRecommendation(type: EventType): string {
  switch (type) {
    case '志愿服务': return '适合希望积累实践经历、参与校园公益的同学。'
    case '赛事': return '适合希望提升专业能力、积累比赛经验的同学。'
    case '讲座': return '适合希望拓展知识视野、了解相关领域的同学。'
    case '社团活动': return '适合希望发展兴趣爱好、结识志同道合伙伴的同学。'
    default: return '建议确认活动内容、参与对象和时间安排后，再决定是否参与。'
  }
}

function generateUrgency(deadline: string): string {
  return !deadline.trim() || deadline === PENDING ? '暂无截止提醒' : `请注意报名截止时间：${deadline}`
}

function createPendingEvent(): Event {
  return { id: `parsed-${Date.now()}`, title: PENDING, type: PENDING, time: PENDING, deadline: PENDING, location: PENDING, audience: PENDING, description: PENDING, summary: generateSummary(PENDING, PENDING, PENDING), recommendation: generateRecommendation(PENDING), urgency: generateUrgency(PENDING), maxParticipants: null }
}

function extractCapacity(text: string): number | null {
  const match = text.match(/(?:人数上限|报名上限|限额|限招|限报|限收|招募人数)\s*[：:]?\s*(\d+)\s*(?:人|名)?|限\s*(\d+)\s*(?:人|名)/)
  return match ? normalizeCapacity(Number(match[1] || match[2])) : null
}

/** 将原始校园通知转换为固定 Event 结构；未来可替换为真实 AI，而无需改变调用方。 */
export function parseEventNotice(text: string): Event {
  try {
    const normalizedText = text.replace(/\r\n?/g, '\n').trim()
    if (!normalizedText) return createPendingEvent()
    const explicitType = extractLabeledValue(normalizedText, labels.type)
    const title = extractTitle(normalizedText)
    const type = normalizeType(explicitType === PENDING ? normalizedText : explicitType)
    const audience = extractLabeledValue(normalizedText, labels.audience)
    const deadline = extractDeadline(normalizedText)
    return {
      id: `parsed-${Date.now()}`,
      title,
      type,
      time: extractLabeledValue(normalizedText, labels.time),
      deadline,
      location: extractLabeledValue(normalizedText, labels.location),
      audience,
      description: normalizedText,
      summary: generateSummary(title, type, audience),
      recommendation: generateRecommendation(type),
      urgency: generateUrgency(deadline),
      maxParticipants: extractCapacity(normalizedText),
    }
  } catch {
    return createPendingEvent()
  }
}

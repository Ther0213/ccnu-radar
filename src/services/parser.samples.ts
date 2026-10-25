import type { Event } from '../types/event'
export interface ParserSample { name: string; text: string; expected: Partial<Event> }
export const parserSamples: ParserSample[] = [
  { name: '标准多行通知', text: '活动名称：桂子山环保志愿服务\n活动时间：10月22日 08:30\n活动地点：桂子山校区\n报名截止：10月19日 18:00\n参与对象：全校学生', expected: { title: '桂子山环保志愿服务', type: '志愿服务', location: '桂子山校区' } },
  { name: '不同标签格式', text: '【程序设计竞赛】\n举办时间 - 11月2日 09:00；举办地点：九号教学楼；报名截止时间：10月28日 23:59。\n面向对象：本科生。', expected: { type: '赛事', time: '11月2日 09:00', audience: '本科生' } },
  { name: '不完整通知', text: '本周五晚有一场校园分享会，欢迎感兴趣的同学参加。', expected: { type: '讲座', title: '待确认', time: '待确认', location: '待确认' } },
]

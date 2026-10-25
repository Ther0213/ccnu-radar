export type EventType = '赛事' | '讲座' | '志愿服务' | '社团活动' | '校园活动' | '待确认'
export type EventSource = 'published' | 'demo' | 'local'
export interface Event { id: string; title: string; type: EventType; time: string; deadline: string; location: string; audience: string; description: string; summary: string; recommendation: string; urgency: string; maxParticipants: number | null; registeredCount?: number; withdrawn?: boolean; cancellationReason?: string; source?: EventSource; qqGroup?: string }
export interface CampusEvent extends Event { accent: string }

import type { Event } from '../types/event'
import { eventSource, eventState } from '../utils/eventPresentation'
import { useActivityClock } from '../hooks/useActivityClock'

export function ActivityBadges({ event }: { event: Event }) {
  const now = useActivityClock()
  const source = eventSource(event)
  const state = eventState(event, now)
  return <><span className={`activity-source source-${source}`}>{source === 'published' ? '已发布' : source === 'demo' ? '演示' : '未发布'}</span>{(source === 'published' || event.withdrawn) && <span className={`activity-status status-${state.kind}`}>{state.label}</span>}</>
}

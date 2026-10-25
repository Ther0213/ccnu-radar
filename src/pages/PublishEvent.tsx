import { useState } from 'react'
import { publishEvent } from '../services/api'
import { ActivityForm } from '../components/ActivityForm'
import type { Event } from '../types/event'
import './PublishEvent.css'
import { InfoDisclosure } from '../components/InfoDisclosure'

export function PublishEvent({ onPublished, onSearch }: { onPublished: (event: Event) => void; onSearch: () => void }) {
  const [success, setSuccess] = useState(false)
  return <main className="publish-page"><p className="section-kicker">发布活动</p><h1>让你的活动被看见</h1><p>填写真实的活动信息，发布后即可在搜索页面查看。</p><p className="publish-note">请填写真实信息。发布后可在“我的发布”中管理。</p><InfoDisclosure title="发布与名单使用说明"><p>活动绑定当前登录账号，可编辑、查看名单或取消。当前未核验学校身份、未启用发布审核；报名名单请仅用于组织活动。</p></InfoDisclosure>
    {success ? <section className="publish-success" role="status"><h2>活动发布成功</h2><p>活动已保存到后端，刷新页面后仍可搜索到。</p><button type="button" className="primary-button" onClick={onSearch}>前往搜索活动</button><button type="button" onClick={() => setSuccess(false)}>继续发布</button></section> : <ActivityForm onSave={async form => { const saved = await publishEvent(form); onPublished(saved); setSuccess(true) }} />}
  </main>
}

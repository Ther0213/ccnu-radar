import { useEffect, useEffectEvent, useState } from 'react'
import { Navbar } from './components/Navbar'
import { demoEvents } from './data/demoEvents'
import { AIParser } from './pages/AIParser'
import { MyEvents } from './pages/MyEvents'
import { SearchEvents } from './pages/SearchEvents'
import { PublishEvent } from './pages/PublishEvent'
import { MyPublications } from './pages/MyPublications'
import { getActivityCatalog, getCurrentUser, getSavedActivityUpdates, completeOnboarding, logout, type User } from './services/api'
import { AuthPage } from './pages/AuthPage'
import { MyRegistrations } from './pages/MyRegistrations'
import { addMyEvent, getMyEvents, removeMyEvent, saveMyEvents } from './services/storage'
import type { Event } from './types/event'
import './App.css'
import { Notifications } from './pages/Notifications'
import { getNotifications } from './services/management'
import { mergeSavedActivities } from './utils/savedActivities'
import { OnboardingTutorial } from './components/OnboardingTutorial'
import { shouldShowOnboarding } from './utils/onboarding'
import { usePageNavigation } from './hooks/usePageNavigation'
import { HomePage } from './pages/HomePage'

function App() {
  const { page, navigate: setPage } = usePageNavigation()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [accountError, setAccountError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [tutorialUserId, setTutorialUserId] = useState<string | null>(null)
  const [deferredTutorialUserId, setDeferredTutorialUserId] = useState<string | null>(null)
  const [notificationState, setNotificationState] = useState({ userId: '', count: 0 })
  const [noticeRevision, setNoticeRevision] = useState(0)
  useEffect(() => {
    if (!user) return
    let active = true
    const load = () => getNotifications().then(items => {
      if (active) setNotificationState({ userId: user.id, count: items.filter(item => !item.readAt).length })
    }).catch(() => { /* The notifications page displays service errors. */ })
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user, noticeRevision])
  useEffect(() => {
    let active = true
    getCurrentUser().then(current => { if (active) setUser(current) }).catch(error => {
      if (active) setAccountError(error instanceof Error ? error.message : '无法读取登录状态。')
    }).finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [])
  const handleAuthenticated = (current: User) => {
    setUser(current); setAccountError('')
    if (page === 'auth') setPage('publications')
  }
  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true); setAccountError('')
    try { await logout(); setUser(null); setPage('home') } catch (error) {
      setAccountError(error instanceof Error ? error.message : '退出失败，请重试。')
    } finally { setLoggingOut(false) }
  }
  const [myActivities, setMyActivities] = useState<Event[]>(getMyEvents)
  const [savedSyncError, setSavedSyncError] = useState('')
  const savedIdsKey = JSON.stringify(myActivities.map(event => event.id))
  const applySavedUpdates = useEffectEvent((updates: Event[]) => {
    // Use the latest state, not the snapshot from when the request started.
    // Removed activities stay removed even if a request finishes afterwards.
    const merged = mergeSavedActivities(myActivities, updates)
    setMyActivities(merged)
    try { saveMyEvents(merged); setSavedSyncError('') } catch {
      setSavedSyncError('最新信息已显示，但无法保存到本机。请检查浏览器存储权限。')
    }
  })
  useEffect(() => {
    const ids: string[] = JSON.parse(savedIdsKey)
    if (!ids.length) return
    let active = true
    const load = async () => {
      try {
        const updates = await getSavedActivityUpdates(ids)
        if (!active) return
        applySavedUpdates(updates)
      } catch {
        if (active) setSavedSyncError('暂时无法同步活动信息，当前显示已保存的历史信息；请勿仅凭历史名额或时间安排报名。')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [page, savedIdsKey])
  const [publishedEvents, setPublishedEvents] = useState<Event[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [publishedError, setPublishedError] = useState('')
  const [withdrawnIds, setWithdrawnIds] = useState<string[]>([])
  useEffect(() => {
    let active = true
    const load = () => getActivityCatalog().then(catalog => { if (active) { setPublishedEvents(catalog.events); setWithdrawnIds(catalog.withdrawnIds); setPublishedError(''); setCatalogLoading(false) } }).catch(error => {
      if (active) { setPublishedError(error instanceof Error ? error.message : '无法读取已发布活动。'); setCatalogLoading(false) }
    })
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [page])
  const addActivity = (event: Event) => setMyActivities(addMyEvent({ ...event, source: 'local' }))
  const removeActivity = (id: string) => setMyActivities(removeMyEvent(id))
  const searchableEvents = Array.from(new Map<string, Event>([...demoEvents.map(event => ({ ...event, source: 'demo' as const })), ...myActivities, ...publishedEvents].filter(event => !withdrawnIds.includes(event.id)).map((event) => [event.id, event])).values())
  const handleWithdrawn = (id: string) => {
    setPublishedEvents(events => events.filter(event => event.id !== id))
    setWithdrawnIds(ids => [...ids, id])
  }

  return <div className="app-shell" id="top"><Navbar onOpenTutorial={() => { if (user) setTutorialUserId(user.id) }} unreadCount={notificationState.userId === user?.id ? notificationState.count : 0} activePage={page} onNavigate={setPage} user={user} authLoading={authLoading} loggingOut={loggingOut} onLogout={() => void handleLogout()} />
    {user && shouldShowOnboarding(user, tutorialUserId, deferredTutorialUserId) && <OnboardingTutorial key={user.id} onDismiss={goSearch => { setDeferredTutorialUserId(user.id); setTutorialUserId(null); if (goSearch) setPage('search') }} onFinish={async goSearch => {
      const updated = await completeOnboarding()
      setUser(current => current?.id === updated.id ? updated : current)
      setTutorialUserId(null); setDeferredTutorialUserId(null)
      if (goSearch) setPage('search')
    }} />}
    {user && deferredTutorialUserId === user.id && user.onboardingCompleted === false && <p className="onboarding-deferred" role="status">教程完成状态尚未同步，本次已暂时关闭，不影响使用。后端更新后，可点击顶部“新手教程”重新保存。</p>}
    {accountError && <p className="account-error" role="alert">{accountError}</p>}
    {(page === 'auth' || page === 'publish' || page === 'publications' || page === 'registrations' || page === 'notifications') && authLoading ? <main className="auth-page"><p role="status">正在读取登录状态…</p></main> : page === 'auth' || ((!user) && (page === 'publish' || page === 'publications' || page === 'notifications' || page === 'registrations')) ? <AuthPage onAuthenticated={handleAuthenticated} /> : page === 'notifications' ? <Notifications key={user?.id} onChanged={() => setNoticeRevision(value => value + 1)} /> : page === 'registrations' ? <MyRegistrations key={user?.id} /> : page === 'publications' ? <MyPublications key={user?.id} onWithdrawn={handleWithdrawn} onUpdated={saved => { setPublishedEvents(items => items.map(item => item.id === saved.id ? saved : item)); setNoticeRevision(value => value + 1) }} /> : page === 'publish' ? <PublishEvent onPublished={(event) => setPublishedEvents(events => [event, ...events])} onSearch={() => setPage('search')} /> : page === 'search' ? <SearchEvents events={searchableEvents} serverError={publishedError} /> : page === 'parser' ? <AIParser onAddActivity={addActivity} /> : page === 'activities' ? <MyEvents events={myActivities} onRemove={removeActivity} syncError={savedSyncError} /> : <HomePage events={publishedEvents} loading={catalogLoading} error={publishedError} onNavigate={setPage} />}
    <footer>CCNU Radar · 让每一份热爱都有回应</footer></div>
}

export default App

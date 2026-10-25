import { useLayoutEffect, useRef } from 'react'
import './Navbar.css'
import type { User } from '../services/api'

import type { PageName } from '../types/navigation'
export type { PageName } from '../types/navigation'
interface NavbarProps { activePage: PageName; onNavigate: (page: PageName) => void; user: User | null; authLoading: boolean; loggingOut: boolean; onLogout: () => void; unreadCount?: number; onOpenTutorial: () => void }
const navItems: Array<{ label: string; page: PageName }> = [{ label: '首页', page: 'home' }, { label: '搜索活动', page: 'search' }, { label: '发布活动', page: 'publish' }, { label: '我的发布', page: 'publications' }, { label: 'AI智能解析', page: 'parser' }, { label: '我的活动', page: 'activities' }, { label: '我的报名', page: 'registrations' }, { label: '站内通知', page: 'notifications' }]

export function Navbar({ activePage, onNavigate, user, authLoading, loggingOut, onLogout, unreadCount = 0, onOpenTutorial }: NavbarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const buttons = useRef<Partial<Record<PageName, HTMLButtonElement | null>>>({})
  useLayoutEffect(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return
    let active = true
    const measure = () => {
      if (!active) return
      const button = buttons.current[activePage]
      indicator.style.opacity = button ? '1' : '0'
      if (!button) return
      indicator.style.setProperty('--pill-x', `${button.offsetLeft}px`)
      indicator.style.setProperty('--pill-y', `${button.offsetTop}px`)
      indicator.style.setProperty('--pill-width', `${button.offsetWidth}px`)
      indicator.style.setProperty('--pill-height', `${button.offsetHeight}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    for (const button of Object.values(buttons.current)) if (button) observer.observe(button)
    void document.fonts.ready.then(measure)
    return () => { active = false; observer.disconnect() }
  }, [activePage, unreadCount])

  return <header className="navbar" onPointerMove={event => {
    if (event.pointerType !== 'mouse') return
    const bounds = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--glass-x', `${event.clientX - bounds.left}px`)
    event.currentTarget.style.setProperty('--glass-y', `${event.clientY - bounds.top}px`)
  }}>
    <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="CCNU Radar 首页"><span className="brand-mark" aria-hidden="true">⌁</span><span>CCNU <strong>Radar</strong></span></button>
    <nav aria-label="主导航"><div className="nav-track" ref={trackRef}><span className="nav-glass-indicator" ref={indicatorRef} aria-hidden="true" />
      {navItems.map(item => <button type="button" ref={element => { buttons.current[item.page] = element }} aria-current={activePage === item.page ? 'page' : undefined} className={activePage === item.page ? 'active' : ''} onClick={() => onNavigate(item.page)} key={item.page}>{item.label}{item.page === 'notifications' && unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>)}
    </div></nav>
    <div className="account-controls">{user ? <><button className="login-button" type="button" onClick={onOpenTutorial}>新手教程</button><span>学号 {user.studentId}</span><button className="login-button" type="button" disabled={loggingOut} onClick={onLogout}>{loggingOut ? '退出中…' : '退出登录'}</button></> : <button className="login-button" type="button" disabled={authLoading} onClick={() => onNavigate('auth')}>{authLoading ? '检查登录…' : '登录 / 注册'}</button>}</div>
  </header>
}

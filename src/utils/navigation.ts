import type { PageName } from '../types/navigation'

const pages: readonly string[] = ['home', 'parser', 'activities', 'search', 'publish', 'publications', 'auth', 'registrations', 'notifications']
export function parsePageHash(hash: string): { page: PageName; section: 'events' | null } {
  if (hash === '#events') return { page: 'home', section: 'events' }
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const page = pages.includes(path) ? path as PageName : 'home'
  return { page, section: page === 'home' && new URLSearchParams(query).get('section') === 'events' ? 'events' : null }
}
export function pageHash(page: PageName, section?: 'events' | null): string {
  return page === 'home' ? section === 'events' ? '#/?section=events' : '#/' : `#/${page}`
}

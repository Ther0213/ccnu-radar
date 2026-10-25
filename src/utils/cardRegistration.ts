import type { Event } from '../types/event'
import type { RegistrationInfo } from '../types/registration'

export interface CardRegistration { event: Event; info: RegistrationInfo }

export function currentCardRegistration(event: Event, snapshot: CardRegistration | null): RegistrationInfo | null {
  // A freshly fetched parent object supersedes the optimistic local snapshot.
  return snapshot?.event === event ? snapshot.info : null
}

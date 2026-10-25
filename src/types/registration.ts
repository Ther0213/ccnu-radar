import type { Event } from './event'

export interface RegistrationInfo {
  eventId: string
  maxParticipants: number | null
  registeredCount: number
  remainingSlots: number | null
  isRegistered: boolean
  isWithdrawn: boolean
  cancellationReason?: string
  isFull: boolean
  deadlinePassed: boolean
  deadlineKnown: boolean
  canRegister: boolean
  reason: string
}

export interface RegisteredEvent extends Event { withdrawn: boolean }

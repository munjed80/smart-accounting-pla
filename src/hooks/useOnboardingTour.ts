/**
 * useOnboardingTour – state machine + persistence for the first-login guided tour.
 *
 * Persistence: localStorage keyed by userId (`onboarding_tour_{userId}`).
 * Only active for role=ZZP.
 *
 * Steps:
 *   0 – Settings  (advance on 'onboarding:settings_saved')
 *   1 – Customers (advance on 'onboarding:customer_created')
 *   2 – Invoices  (advance on 'onboarding:invoice_created')
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface TourStep {
  /** Path to navigate to when this step becomes active */
  route: string
  /** CSS selector (data-onboarding attribute) for the spotlight target */
  targetSelector: string
  /** Dutch tooltip text */
  tooltip: string
  /** Window CustomEvent name that auto-advances to the next step */
  advanceOn: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    route: '/settings',
    targetSelector: '[data-onboarding="settings-menu"]',
    tooltip: 'Stap 1: Vul je bedrijfsgegevens in bij Instellingen en klik op Opslaan.',
    advanceOn: 'onboarding:settings_saved',
  },
  {
    route: '/zzp/customers',
    targetSelector: '[data-onboarding="new-customer-btn"]',
    tooltip: 'Stap 2: Voeg je eerste klant toe via de knop "Nieuwe klant".',
    advanceOn: 'onboarding:customer_created',
  },
  {
    route: '/zzp/invoices',
    targetSelector: '[data-onboarding="new-invoice-btn"]',
    tooltip: 'Top! Maak nu je eerste factuur via de knop "Nieuwe factuur".',
    advanceOn: 'onboarding:invoice_created',
  },
]

export interface OnboardingTourState {
  active: boolean
  step: number
  completed: boolean
  skipped: boolean
  completedAt?: string
  skippedAt?: string
  neverShow?: boolean
}

const STORAGE_KEY_PREFIX = 'onboarding_tour_'

const defaultState = (): OnboardingTourState => ({
  active: false,
  step: 0,
  completed: false,
  skipped: false,
})

const loadState = (userId: string): OnboardingTourState => {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`)
    if (raw) return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return defaultState()
}

const saveState = (userId: string, state: OnboardingTourState) => {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export interface UseOnboardingTourReturn {
  tourState: OnboardingTourState
  currentStep: TourStep | null
  /** Start (or re-start) the tour. */
  startTour: () => void
  /** Advance to the next step programmatically. */
  nextStep: () => void
  /** Skip the tour and mark skipped timestamp. */
  skip: () => void
  /** Mark "never show again" and close. */
  neverShow: () => void
  /** Mark tour as completed (called after last step). */
  complete: () => void
}

export const useOnboardingTour = (
  userId: string | undefined,
  role: string | undefined,
): UseOnboardingTourReturn => {
  const [tourState, setTourState] = useState<OnboardingTourState>(defaultState)
  const initialised = useRef(false)

  // Load persisted state once userId is available
  useEffect(() => {
    if (!userId || role !== 'zzp') return
    if (initialised.current) return
    initialised.current = true

    const persisted = loadState(userId)
    setTourState(persisted)

    // Auto-start for fresh users (not completed, not skipped, not neverShow)
    if (!persisted.completed && !persisted.skipped && !persisted.neverShow && !persisted.active) {
      const fresh = { ...persisted, active: true }
      setTourState(fresh)
      saveState(userId, fresh)
    }
  }, [userId, role])

  // Update & persist helper
  const update = useCallback(
    (patch: Partial<OnboardingTourState>) => {
      if (!userId) return
      setTourState(prev => {
        const next = { ...prev, ...patch }
        saveState(userId, next)
        return next
      })
    },
    [userId],
  )

  // Listen for advance events
  useEffect(() => {
    if (!userId || role !== 'zzp') return
    if (!tourState.active) return

    const currentStep = TOUR_STEPS[tourState.step]
    if (!currentStep) return

    const handler = () => {
      const nextStepIndex = tourState.step + 1
      if (nextStepIndex >= TOUR_STEPS.length) {
        // All steps done
        update({ active: false, completed: true, completedAt: new Date().toISOString() })
      } else {
        update({ step: nextStepIndex })
      }
    }

    window.addEventListener(currentStep.advanceOn, handler)
    return () => window.removeEventListener(currentStep.advanceOn, handler)
  }, [userId, role, tourState.active, tourState.step, update])

  const startTour = useCallback(() => {
    update({ active: true, step: 0, completed: false, skipped: false, neverShow: false })
  }, [update])

  const nextStep = useCallback(() => {
    const next = tourState.step + 1
    if (next >= TOUR_STEPS.length) {
      update({ active: false, completed: true, completedAt: new Date().toISOString() })
    } else {
      update({ step: next })
    }
  }, [tourState.step, update])

  const skip = useCallback(() => {
    update({ active: false, skipped: true, skippedAt: new Date().toISOString() })
  }, [update])

  const neverShowFn = useCallback(() => {
    update({ active: false, neverShow: true })
  }, [update])

  const complete = useCallback(() => {
    update({ active: false, completed: true, completedAt: new Date().toISOString() })
  }, [update])

  const currentStep = tourState.active && tourState.step < TOUR_STEPS.length
    ? TOUR_STEPS[tourState.step]
    : null

  return {
    tourState,
    currentStep,
    startTour,
    nextStep,
    skip,
    neverShow: neverShowFn,
    complete,
  }
}

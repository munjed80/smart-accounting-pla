/**
 * Unit tests for useOnboardingTour hook and OnboardingTour component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useOnboardingTour, TOUR_STEPS } from '../hooks/useOnboardingTour'
import { OnboardingTour } from '../components/OnboardingTour'

// ----------- Mocks -----------

vi.mock('../lib/navigation', () => ({ navigateTo: vi.fn() }))

// Minimal i18n stub (not used in these components, just to be safe)
vi.mock('../i18n', () => ({ t: (k: string) => k }))

// ----------- localStorage helpers -----------
const STORAGE_KEY = (userId: string) => `onboarding_tour_${userId}`

const clearStorage = () => {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('onboarding_tour_')) localStorage.removeItem(k)
  })
}

// ----------- useOnboardingTour tests -----------

describe('useOnboardingTour', () => {
  beforeEach(() => {
    clearStorage()
  })

  afterEach(() => {
    clearStorage()
  })

  it('auto-starts for a new ZZP user with no persisted state', () => {
    const { result } = renderHook(() => useOnboardingTour('user-1', 'zzp'))

    // After mount, tour should be active at step 0
    expect(result.current.tourState.active).toBe(true)
    expect(result.current.tourState.step).toBe(0)
    expect(result.current.tourState.completed).toBe(false)
  })

  it('does NOT start for a non-ZZP user', () => {
    const { result } = renderHook(() => useOnboardingTour('user-2', 'accountant'))
    expect(result.current.tourState.active).toBe(false)
  })

  it('does NOT start when tour is already completed', () => {
    localStorage.setItem(
      STORAGE_KEY('user-3'),
      JSON.stringify({ active: false, step: 0, completed: true }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-3', 'zzp'))
    expect(result.current.tourState.active).toBe(false)
    expect(result.current.tourState.completed).toBe(true)
  })

  it('does NOT start when neverShow is set', () => {
    localStorage.setItem(
      STORAGE_KEY('user-4'),
      JSON.stringify({ active: false, step: 0, neverShow: true }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-4', 'zzp'))
    expect(result.current.tourState.active).toBe(false)
  })

  it('does NOT start when tour was skipped', () => {
    localStorage.setItem(
      STORAGE_KEY('user-5'),
      JSON.stringify({ active: false, step: 0, skipped: true }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-5', 'zzp'))
    expect(result.current.tourState.active).toBe(false)
    expect(result.current.tourState.skipped).toBe(true)
  })

  it('nextStep advances to step 1', () => {
    const { result } = renderHook(() => useOnboardingTour('user-6', 'zzp'))

    act(() => {
      result.current.nextStep()
    })

    expect(result.current.tourState.step).toBe(1)
    expect(result.current.tourState.active).toBe(true)
  })

  it('nextStep on last step completes the tour', () => {
    localStorage.setItem(
      STORAGE_KEY('user-7'),
      JSON.stringify({ active: true, step: TOUR_STEPS.length - 1 }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-7', 'zzp'))

    act(() => {
      result.current.nextStep()
    })

    expect(result.current.tourState.active).toBe(false)
    expect(result.current.tourState.completed).toBe(true)
    expect(result.current.tourState.completedAt).toBeDefined()
  })

  it('skip sets skipped=true and active=false', () => {
    const { result } = renderHook(() => useOnboardingTour('user-8', 'zzp'))

    act(() => {
      result.current.skip()
    })

    expect(result.current.tourState.active).toBe(false)
    expect(result.current.tourState.skipped).toBe(true)
    expect(result.current.tourState.skippedAt).toBeDefined()
  })

  it('neverShow sets neverShow=true and active=false', () => {
    const { result } = renderHook(() => useOnboardingTour('user-9', 'zzp'))

    act(() => {
      result.current.neverShow()
    })

    expect(result.current.tourState.active).toBe(false)
    expect(result.current.tourState.neverShow).toBe(true)
  })

  it('persists state to localStorage', () => {
    const { result } = renderHook(() => useOnboardingTour('user-10', 'zzp'))

    act(() => {
      result.current.nextStep()
    })

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY('user-10')) || '{}')
    expect(persisted.step).toBe(1)
  })

  it('startTour resets to step 0 even if previously skipped', () => {
    localStorage.setItem(
      STORAGE_KEY('user-11'),
      JSON.stringify({ active: false, step: 1, skipped: true }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-11', 'zzp'))

    act(() => {
      result.current.startTour()
    })

    expect(result.current.tourState.active).toBe(true)
    expect(result.current.tourState.step).toBe(0)
    expect(result.current.tourState.skipped).toBe(false)
  })

  it('currentStep returns the correct step object', () => {
    const { result } = renderHook(() => useOnboardingTour('user-12', 'zzp'))

    expect(result.current.currentStep).toBe(TOUR_STEPS[0])
  })

  it('currentStep is null when tour is not active', () => {
    localStorage.setItem(
      STORAGE_KEY('user-13'),
      JSON.stringify({ active: false, completed: true }),
    )
    const { result } = renderHook(() => useOnboardingTour('user-13', 'zzp'))
    expect(result.current.currentStep).toBeNull()
  })

  it('auto-advances via window event for current step', async () => {
    const { result } = renderHook(() => useOnboardingTour('user-14', 'zzp'))

    // Tour starts at step 0 which listens for 'onboarding:settings_saved'
    expect(result.current.tourState.step).toBe(0)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('onboarding:settings_saved'))
    })

    expect(result.current.tourState.step).toBe(1)
  })
})

// ----------- OnboardingTour component tests -----------

describe('OnboardingTour', () => {
  const defaultTourState = {
    active: true,
    step: 0,
    completed: false,
    skipped: false,
  }

  it('renders nothing when tour is not active', () => {
    const { container } = render(
      <OnboardingTour
        tourState={{ ...defaultTourState, active: false }}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onNeverShow={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders tooltip dialog when tour is active', () => {
    render(
      <OnboardingTour
        tourState={defaultTourState}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onNeverShow={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Stap 1/)).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('calls onNext when "Volgende" is clicked', () => {
    const onNext = vi.fn()
    render(
      <OnboardingTour
        tourState={defaultTourState}
        onNext={onNext}
        onSkip={vi.fn()}
        onNeverShow={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Volgende'))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('calls onSkip when "Later" is clicked', () => {
    const onSkip = vi.fn()
    render(
      <OnboardingTour
        tourState={defaultTourState}
        onNext={vi.fn()}
        onSkip={onSkip}
        onNeverShow={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Later'))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('calls onNeverShow when "Niet meer tonen" is clicked', () => {
    const onNeverShow = vi.fn()
    render(
      <OnboardingTour
        tourState={defaultTourState}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onNeverShow={onNeverShow}
      />,
    )

    fireEvent.click(screen.getByText('Niet meer tonen'))
    expect(onNeverShow).toHaveBeenCalledOnce()
  })

  it('calls onSkip when close (X) button is clicked', () => {
    const onSkip = vi.fn()
    render(
      <OnboardingTour
        tourState={defaultTourState}
        onNext={vi.fn()}
        onSkip={onSkip}
        onNeverShow={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Rondleiding sluiten'))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('shows correct step indicator for step 2', () => {
    render(
      <OnboardingTour
        tourState={{ ...defaultTourState, step: 1 }}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onNeverShow={vi.fn()}
      />,
    )

    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByText(/Stap 2/)).toBeInTheDocument()
  })

  it('shows correct step indicator for step 3', () => {
    render(
      <OnboardingTour
        tourState={{ ...defaultTourState, step: 2 }}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onNeverShow={vi.fn()}
      />,
    )

    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.getByText(/Top!/)).toBeInTheDocument()
  })
})

/**
 * OnboardingTour – lightweight guided-tour overlay for ZZP first-login.
 *
 * Renders a semi-transparent backdrop with a spotlight cutout around the
 * target element, plus a tooltip card with step indicator and action buttons.
 *
 * No external tour libraries – pure CSS + React portal.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { TOUR_STEPS, OnboardingTourState } from '@/hooks/useOnboardingTour'
import { navigateTo } from '@/lib/navigation'
import { Question, X } from '@phosphor-icons/react'

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface TooltipPosition {
  top: number
  left: number
}

const PADDING = 8 // px padding around spotlight target
const TOOLTIP_WIDTH = 320

function getSpotlightRect(selector: string): SpotlightRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  }
}

function calcTooltipPosition(spot: SpotlightRect): TooltipPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Prefer below the spotlight
  let top = spot.top + spot.height + 12
  let left = spot.left

  // Clamp horizontally
  if (left + TOOLTIP_WIDTH > vw - 12) {
    left = vw - TOOLTIP_WIDTH - 12
  }
  if (left < 12) left = 12

  // If tooltip goes below viewport, show above instead
  if (top + 160 > vh) {
    top = spot.top - 160 - 12
  }
  if (top < 12) top = 12

  return { top, left }
}

interface OnboardingTourProps {
  tourState: OnboardingTourState
  onNext: () => void
  onSkip: () => void
  onNeverShow: () => void
}

export const OnboardingTour = ({ tourState, onNext, onSkip, onNeverShow }: OnboardingTourProps) => {
  const [spot, setSpot] = useState<SpotlightRect | null>(null)
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ top: 0, left: 0 })
  const rafRef = useRef<number>(0)

  const currentStep = tourState.active && tourState.step < TOUR_STEPS.length
    ? TOUR_STEPS[tourState.step]
    : null

  // Navigate to the route for the current step
  useEffect(() => {
    if (!currentStep) return
    const path = currentStep.route
    // Only navigate if not already on the right path
    if (!window.location.pathname.startsWith(path)) {
      navigateTo(path)
    }
  }, [currentStep])  // eslint-disable-line react-hooks/exhaustive-deps

  // Track spotlight target position (re-measures on scroll/resize/route-change)
  const measure = useCallback(() => {
    if (!currentStep) return
    const r = getSpotlightRect(currentStep.targetSelector)
    setSpot(r)
    if (r) setTooltipPos(calcTooltipPosition(r))
  }, [currentStep])

  useEffect(() => {
    if (!currentStep) { setSpot(null); return }

    measure()

    // Re-measure when layout changes
    const onResize = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(measure) }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    // Also poll briefly (element may not exist until route render completes)
    const interval = setInterval(measure, 400)
    const timeout = setTimeout(() => clearInterval(interval), 4000)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      clearInterval(interval)
      clearTimeout(timeout)
      cancelAnimationFrame(rafRef.current)
    }
  }, [currentStep, measure])

  if (!tourState.active || !currentStep) return null

  const stepIndex = tourState.step
  const totalSteps = TOUR_STEPS.length

  const overlay = (
    <>
      {/* Dark backdrop with SVG cutout */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          pointerEvents: 'none',
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0 }}
        >
          <defs>
            <mask id="onboarding-mask">
              <rect width="100%" height="100%" fill="white" />
              {spot && (
                <rect
                  x={spot.left}
                  y={spot.top}
                  width={spot.width}
                  height={spot.height}
                  rx={6}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#onboarding-mask)"
          />
        </svg>
      </div>

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-label={`Rondleiding stap ${stepIndex + 1} van ${totalSteps}`}
        aria-live="polite"
        style={{
          position: 'fixed',
          zIndex: 9001,
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: TOOLTIP_WIDTH,
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
          padding: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            {stepIndex + 1}/{totalSteps}
          </span>
          <button
            onClick={onSkip}
            aria-label="Rondleiding sluiten"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'hsl(var(--muted-foreground))' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tooltip text */}
        <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 16, color: 'hsl(var(--foreground))' }}>
          {currentStep.tooltip}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" onClick={onNext}>
            Volgende
          </Button>
          <Button size="sm" variant="outline" onClick={onSkip}>
            Later
          </Button>
          <Button size="sm" variant="ghost" onClick={onNeverShow}>
            Niet meer tonen
          </Button>
        </div>
      </div>
    </>
  )

  return createPortal(overlay, document.body)
}

/**
 * Small "?" icon button rendered inside the AppShell that lets users re-run
 * the tour at any time. Only shown for ZZP role.
 */
interface TourHelpButtonProps {
  onStart: () => void
}

export const TourHelpButton = ({ onStart }: TourHelpButtonProps) => (
  <button
    onClick={onStart}
    title="Rondleiding opnieuw starten"
    aria-label="Rondleiding opnieuw starten"
    data-onboarding="tour-help-btn"
    style={{
      background: 'none',
      border: '1px solid hsl(var(--border))',
      borderRadius: '50%',
      width: 28,
      height: 28,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: 'hsl(var(--muted-foreground))',
    }}
  >
    <Question size={16} weight="bold" />
  </button>
)

/**
 * OnboardingTour – premium guided-tour overlay for ZZP first-login.
 *
 * Renders a dimmed backdrop (0.65 opacity) with SVG spotlight cutout around the
 * target element, a glowing highlight border, and a dark glass tooltip card.
 *
 * Features: auto-scroll to target, ESC closes, focus trap, off-screen clamping.
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

const PADDING = 10 // px padding around spotlight target
const SPOTLIGHT_RADIUS = 10 // shared border-radius for SVG cutout and glow border
const TOOLTIP_WIDTH = 320
const TOOLTIP_APPROX_HEIGHT = 230 // used for above/below placement decision
const MARGIN = 12 // minimum distance from viewport edges

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

  // Prefer below the spotlight; flip above if it would overflow viewport bottom
  let top = spot.top + spot.height + MARGIN
  if (top + TOOLTIP_APPROX_HEIGHT > vh - MARGIN) {
    top = spot.top - TOOLTIP_APPROX_HEIGHT - MARGIN
  }
  // Clamp vertically
  top = Math.max(MARGIN, Math.min(top, vh - TOOLTIP_APPROX_HEIGHT - MARGIN))

  // Align left with spotlight, clamped to viewport
  const maxWidth = Math.min(TOOLTIP_WIDTH, vw - MARGIN * 2)
  let left = spot.left
  left = Math.max(MARGIN, Math.min(left, vw - maxWidth - MARGIN))

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
  const dialogRef = useRef<HTMLDivElement>(null)

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
    // Auto-scroll target into view before measuring (respect reduced-motion preference)
    const el = document.querySelector(currentStep.targetSelector)
    if (el) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ behavior: prefersReduced ? 'instant' : 'smooth', block: 'center' })
    }
    const r = getSpotlightRect(currentStep.targetSelector)
    setSpot(r)
    if (r) setTooltipPos(calcTooltipPosition(r))
  }, [currentStep])

  useEffect(() => {
    if (!currentStep) { setSpot(null); return }

    measure()

    // Re-measure when layout changes (resize, scroll, keyboard open/close)
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

  // ESC key closes the tour
  useEffect(() => {
    if (!tourState.active) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tourState.active, onSkip])

  // Focus trap inside the tooltip card
  useEffect(() => {
    if (!tourState.active || !dialogRef.current) return
    const dialog = dialogRef.current
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'),
    )
    if (focusable.length) focusable[0].focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        last.focus(); e.preventDefault()
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus(); e.preventDefault()
      }
    }
    dialog.addEventListener('keydown', handleTab)
    return () => dialog.removeEventListener('keydown', handleTab)
  }, [tourState.active, spot])

  if (!tourState.active || !currentStep) return null

  const stepIndex = tourState.step
  const totalSteps = TOUR_STEPS.length
  const cardWidth = typeof window !== 'undefined'
    ? Math.min(TOOLTIP_WIDTH, window.innerWidth - MARGIN * 2)
    : TOOLTIP_WIDTH

  const overlay = (
    <>
      {/* Dimmed backdrop with SVG spotlight cutout – click to skip */}
      <div
        aria-hidden="true"
        onClick={onSkip}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          cursor: 'pointer',
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
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
                  rx={SPOTLIGHT_RADIUS}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.65)"
            mask="url(#onboarding-mask)"
          />
        </svg>

        {/* Glow border around spotlight target */}
        {spot && (
          <div
            style={{
              position: 'absolute',
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              borderRadius: SPOTLIGHT_RADIUS,
              boxShadow: '0 0 0 2px #60a5fa, 0 0 18px 4px rgba(96,165,250,0.3)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {/* Tooltip card – dark glass, premium style */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={`Rondleiding stap ${stepIndex + 1} van ${totalSteps}`}
        aria-live="polite"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          zIndex: 9001,
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: cardWidth,
          background: 'rgba(15,23,42,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: '18px',
          color: '#f1f5f9',
        }}
      >
        {/* Header: step badge + X close */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span
            aria-label={`Stap ${stepIndex + 1} van ${totalSteps}`}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#60a5fa',
              background: 'rgba(96,165,250,0.12)',
              padding: '3px 9px',
              borderRadius: 20,
              border: '1px solid rgba(96,165,250,0.25)',
              lineHeight: 1.6,
            }}
          >
            {stepIndex + 1}/{totalSteps}
          </span>
          <button
            onClick={onSkip}
            aria-label="Rondleiding sluiten"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: 8,
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Tooltip body text */}
        <p style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: '#e2e8f0',
          margin: '0 0 20px 0',
          fontWeight: 400,
        }}>
          {currentStep.tooltip}
        </p>

        {/* Primary (Volgende) + Secondary (Later) row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Button
            size="sm"
            onClick={onNext}
            aria-label="Volgende stap"
            style={{ flex: 1 }}
          >
            Volgende
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSkip}
            aria-label="Rondleiding later bekijken"
            style={{
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.18)',
              color: '#cbd5e1',
            }}
          >
            Later
          </Button>
        </div>

        {/* Tertiary: never show again */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onNeverShow}
            aria-label="Rondleiding nooit meer tonen"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: '#64748b',
              padding: '2px 4px',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(100,116,139,0.4)',
              textUnderlineOffset: '3px',
            }}
          >
            Niet meer tonen
          </button>
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

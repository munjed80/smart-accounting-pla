/**
 * Shared components and helpers for the Belastinghulp (tax) section.
 *
 * Keeps the individual tax pages DRY by centralising formatting helpers
 * and repeated UI primitives.
 *
 * Visual design notes
 * -------------------
 * The visual language here mirrors the Agenda page (`ZZPAgendaPage`):
 * - Soft `bg-card/80 backdrop-blur-sm` surfaces with `border-border/50`.
 * - Subtle left accent stripe (`border-l-4 border-l-{color}-500/70`)
 *   instead of saturated tinted backgrounds.
 * - Duotone icons in a small `bg-{color}-500/10` rounded chip rather
 *   than a plain coloured icon.
 * - Restrained, premium colour balance — avoid loud blue/amber/red
 *   fills.
 *
 * All Belastinghulp pages should use these primitives instead of
 * re-implementing flat coloured panels, so the section feels like a
 * coherent product family.
 */

import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  WarningCircle,
  Info,
  CaretRight,
  Lightbulb,
  CheckCircle,
  ShieldWarning,
} from '@phosphor-icons/react'
import { navigateTo } from '@/lib/navigation'
import { cn } from '@/lib/utils'

// ============================================================================
// Currency helpers
// ============================================================================

/** Format a cents value as Dutch-locale EUR currency string. */
export const formatCurrency = (cents: number): string => {
  const euros = cents / 100
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(euros)
}

/** Format a cents value as absolute EUR currency string (no negative sign). */
export const formatCurrencyAbs = (cents: number): string =>
  formatCurrency(Math.abs(cents))

// ============================================================================
// Tone tokens
// ============================================================================
//
// Centralised colour map for "tone" used by the soft note/info/warning
// primitives below.  Keeps the same restrained palette across every
// Belastinghulp page and avoids ad-hoc Tailwind colour strings.

export type Tone = 'info' | 'tip' | 'warning' | 'error' | 'success' | 'neutral'

interface ToneStyle {
  /** Soft surface tint (very low opacity to keep the dark theme calm). */
  surface: string
  /** Border colour — soft, low-saturation. */
  border: string
  /** Left accent stripe (`border-l-{color}` ready). */
  stripe: string
  /** Background for the icon chip (`bg-{color}/10`). */
  chipBg: string
  /** Icon foreground colour. */
  iconText: string
}

const toneStyles: Record<Tone, ToneStyle> = {
  info: {
    surface: 'bg-blue-500/[0.04] dark:bg-blue-400/[0.05]',
    border: 'border-blue-500/15 dark:border-blue-400/15',
    stripe: 'border-l-blue-500/70 dark:border-l-blue-400/70',
    chipBg: 'bg-blue-500/10 dark:bg-blue-400/10',
    iconText: 'text-blue-600 dark:text-blue-300',
  },
  tip: {
    surface: 'bg-primary/[0.04]',
    border: 'border-primary/15',
    stripe: 'border-l-primary/70',
    chipBg: 'bg-primary/10',
    iconText: 'text-primary',
  },
  warning: {
    surface: 'bg-amber-500/[0.05] dark:bg-amber-400/[0.05]',
    border: 'border-amber-500/20 dark:border-amber-400/20',
    stripe: 'border-l-amber-500/70 dark:border-l-amber-400/70',
    chipBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    iconText: 'text-amber-600 dark:text-amber-300',
  },
  error: {
    surface: 'bg-red-500/[0.05] dark:bg-red-400/[0.05]',
    border: 'border-red-500/20 dark:border-red-400/20',
    stripe: 'border-l-red-500/70 dark:border-l-red-400/70',
    chipBg: 'bg-red-500/10 dark:bg-red-400/10',
    iconText: 'text-red-600 dark:text-red-300',
  },
  success: {
    surface: 'bg-emerald-500/[0.05] dark:bg-emerald-400/[0.05]',
    border: 'border-emerald-500/20 dark:border-emerald-400/20',
    stripe: 'border-l-emerald-500/70 dark:border-l-emerald-400/70',
    chipBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    iconText: 'text-emerald-600 dark:text-emerald-300',
  },
  neutral: {
    surface: 'bg-muted/30',
    border: 'border-border/60',
    stripe: 'border-l-border',
    chipBg: 'bg-muted',
    iconText: 'text-muted-foreground',
  },
}

// ============================================================================
// Icon chip
// ============================================================================

/**
 * Small rounded icon chip used throughout the Belastinghulp pages.
 *
 * Same pattern as the Agenda page (`h-10 w-10 rounded-lg bg-primary/10`),
 * exposed as a primitive so cards, headers and notes share one look.
 */
export interface IconChipProps {
  icon: React.ReactNode
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const IconChip = ({
  icon,
  tone = 'tip',
  size = 'md',
  className,
}: IconChipProps) => {
  const style = toneStyles[tone]
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 rounded-md'
      : size === 'lg'
        ? 'h-14 w-14 rounded-xl'
        : 'h-10 w-10 rounded-lg'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        sizeClass,
        style.chipBg,
        style.iconText,
        className,
      )}
    >
      {icon}
    </span>
  )
}

// ============================================================================
// Soft note (info / tip / warning / etc.)
// ============================================================================

/**
 * Soft "note" panel used for inline explanations, tips and disclaimers.
 *
 * Replaces the old flat `bg-blue-50 border-blue-200` blocks that made the
 * Belastinghulp pages feel pasted-on.  Visually integrates with the
 * surrounding card surfaces by using a low-opacity tinted surface and a
 * soft accent stripe.
 */
export interface SoftNoteProps {
  tone?: Tone
  title?: React.ReactNode
  description?: React.ReactNode
  items?: React.ReactNode[]
  source?: React.ReactNode
  checkHint?: React.ReactNode
  icon?: React.ReactNode
  /** Render in a more compact form (used for inline help). */
  size?: 'sm' | 'md'
  children?: React.ReactNode
  className?: string
}

const defaultIconForTone = (tone: Tone): React.ReactNode => {
  switch (tone) {
    case 'tip':
      return <Lightbulb size={16} weight="duotone" />
    case 'warning':
      return <WarningCircle size={16} weight="duotone" />
    case 'error':
      return <WarningCircle size={16} weight="duotone" />
    case 'success':
      return <CheckCircle size={16} weight="duotone" />
    case 'neutral':
      return <ShieldWarning size={16} weight="duotone" />
    case 'info':
    default:
      return <Info size={16} weight="duotone" />
  }
}

export const SoftNote = ({
  tone = 'info',
  title,
  description,
  items,
  source,
  checkHint,
  icon,
  size = 'md',
  children,
  className,
}: SoftNoteProps) => {
  const style = toneStyles[tone]
  const isCompact = size === 'sm'
  return (
    <div
      className={cn(
        'rounded-lg border border-l-4 backdrop-blur-sm',
        style.surface,
        style.border,
        style.stripe,
        isCompact ? 'p-3 text-xs' : 'p-4 text-sm',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IconChip
          icon={icon ?? defaultIconForTone(tone)}
          tone={tone}
          size="sm"
        />
        <div className="min-w-0 flex-1 space-y-1">
          {title && (
            <p className={cn('font-medium leading-snug', isCompact ? 'text-xs' : 'text-sm')}>
              {title}
            </p>
          )}
          {description && (
            <p className={cn('text-muted-foreground leading-relaxed', isCompact ? 'text-xs' : 'text-sm')}>
              {description}
            </p>
          )}
          {items && items.length > 0 && (
            <ul className={cn('space-y-0.5 pt-1', isCompact ? 'text-xs' : 'text-sm')}>
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                  <span className={cn('mt-1 h-1 w-1 shrink-0 rounded-full', style.iconText, 'bg-current opacity-70')} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {source && (
            <p className={cn('italic text-muted-foreground', isCompact ? 'text-[11px]' : 'text-xs')}>
              Bron: {source}
            </p>
          )}
          {checkHint && (
            <p className={cn('text-muted-foreground/90', isCompact ? 'text-[11px]' : 'text-xs')}>
              ✓ Check: {checkHint}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Section card — premium card surface used across Belastinghulp
// ============================================================================
//
// Wraps the standard `<Card>` look from the Agenda page so all
// Belastinghulp section cards share the same translucent surface and
// soft border.  Use plain `<Card>` only for very dense data tables.

export const sectionCardClass =
  'bg-card/80 backdrop-blur-sm border border-border/50'

// ============================================================================
// Disclaimer block
// ============================================================================

export const Disclaimer = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-3 backdrop-blur-sm',
      className,
    )}
  >
    <IconChip
      icon={<ShieldWarning size={16} weight="duotone" />}
      tone="neutral"
      size="sm"
    />
    <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  </div>
)

/** Shape of a warning returned by both BTW and Income Tax endpoints. */
export interface TaxWarning {
  id: string
  severity: 'error' | 'warning' | 'info'
  title: string
  description: string
  action_hint?: string
  related_route?: string
}

/** Renders a single warning with severity colouring and an optional link. */
export const TaxWarningItem = ({ warning }: { warning: TaxWarning }) => {
  const tone: Tone =
    warning.severity === 'error'
      ? 'error'
      : warning.severity === 'warning'
        ? 'warning'
        : 'info'

  return (
    <SoftNote
      tone={tone}
      title={warning.title}
      description={warning.description}
    >
      {warning.action_hint && (
        <p className="text-xs font-medium">{warning.action_hint}</p>
      )}
      {warning.related_route && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => navigateTo(warning.related_route!)}
        >
          Bekijken <CaretRight size={12} className="ml-0.5" />
        </Button>
      )}
    </SoftNote>
  )
}

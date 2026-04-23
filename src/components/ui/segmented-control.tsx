import { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * SegmentedControl
 *
 * Lightweight pill-style filter / period selector used across the app
 * (e.g. Invoices monthly overview, dashboard time-range pickers).
 *
 * Centralises the look so every "row of pills" the user clicks looks
 * and behaves the same way. Render-time state is driven by `value`;
 * the parent owns the value.
 */
export interface SegmentedControlOption<TValue extends string> {
  value: TValue
  label: ReactNode
  /** Optional aria-label override; falls back to `label` when it's a string. */
  ariaLabel?: string
}

interface SegmentedControlProps<TValue extends string> {
  value: TValue
  onChange: (value: TValue) => void
  options: ReadonlyArray<SegmentedControlOption<TValue>>
  /** Visual size — defaults to `"sm"` to match existing tight toolbars. */
  size?: "sm" | "md"
  /** Accessible label for the group. */
  ariaLabel?: string
  className?: string
}

export function SegmentedControl<TValue extends string>({
  value,
  onChange,
  options,
  size = "sm",
  ariaLabel,
  className,
}: SegmentedControlProps<TValue>) {
  const sizeClass =
    size === "md"
      ? "text-sm px-3 py-1.5"
      : "text-xs px-2.5 py-1"

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {options.map((option) => {
        const isActive = option.value === value
        const a11yLabel =
          option.ariaLabel ??
          (typeof option.label === "string" ? option.label : undefined)
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={a11yLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              sizeClass,
              isActive
                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                : "border-border/50 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

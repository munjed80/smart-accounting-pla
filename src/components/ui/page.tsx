import { ReactNode, ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * PageContainer
 *
 * Standard full-bleed page background used across the app:
 * a subtle gradient + radial glow that gives every page the same
 * "premium" backdrop without each page re-implementing the wrapper.
 *
 * Centers content in a max-width column and applies the canonical
 * responsive horizontal/vertical padding.
 *
 * Use `width="narrow"` for forms / settings (max-w-4xl) and the
 * default for data-heavy pages (max-w-7xl).
 */
type PageContainerProps = ComponentProps<"div"> & {
  width?: "narrow" | "wide" | "full"
  /**
   * Vertical padding. Defaults to the standard page padding used by the
   * data-heavy ZZP pages (`py-6 sm:py-12`). Pass `"compact"` for tighter
   * spacing on simpler pages (settings, onboarding).
   */
  padding?: "default" | "compact"
}

export function PageContainer({
  className,
  width = "wide",
  padding = "default",
  children,
  ...props
}: PageContainerProps) {
  const widthClass =
    width === "narrow"
      ? "max-w-4xl"
      : width === "full"
        ? "max-w-full"
        : "max-w-7xl"

  const paddingClass =
    padding === "compact" ? "py-6 sm:py-8" : "py-6 sm:py-12"

  return (
    <div
      data-slot="page-container"
      className={cn(
        "relative min-h-screen bg-gradient-to-br from-background via-secondary to-background",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]"
      />
      <div
        className={cn(
          "relative mx-auto px-4 sm:px-6 lg:px-8",
          widthClass,
          paddingClass,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * PageHeader
 *
 * Canonical page heading used across the app. Combines the
 * gradient brand title, an optional icon, an optional description
 * and a slot for primary actions on the right.
 *
 * Uses the same responsive type scale already adopted by the
 * Invoices/Quotes/Customers pages so all pages line up.
 */
type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  /** Phosphor (or any) icon node — should be a single sized element. */
  icon?: ReactNode
  /** Right-aligned action area (buttons, badges …). */
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="mb-1 flex items-center gap-2 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-2xl font-bold text-transparent sm:mb-2 sm:gap-3 sm:text-3xl lg:text-4xl">
          {icon ? <span className="shrink-0 text-primary">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

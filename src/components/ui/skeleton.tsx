import { cn } from "@/lib/utils"
import { ComponentProps } from "react"

/**
 * Professional skeleton loader with neutral shimmer effect.
 * Uses dark/gray tones matching modern financial SaaS (Stripe/Linear style).
 * Includes smooth fade transitions and shimmer animation.
 */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md",
        "bg-muted/50",
        "before:absolute before:inset-0",
        "before:-translate-x-full",
        "before:animate-[shimmer_2s_infinite]",
        "before:bg-gradient-to-r",
        "before:from-transparent before:via-muted/80 before:to-transparent",
        className
      )}
      style={{
        opacity: 1,
        transition: 'opacity 200ms ease-in-out, transform 200ms ease-in-out',
      }}
      {...props}
    />
  )
}

export { Skeleton }

import type { AnchorHTMLAttributes } from 'react'
import { navigateTo } from '@/lib/navigation'

export function OverviewLink({
  href = '#',
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          (!props.target || props.target === '_self')
        ) {
          event.preventDefault()
          navigateTo(href)
        }
      }}
    />
  )
}

import { toast as sonnerToast } from 'sonner'

export type ToastVariant = 'default' | 'destructive'

export interface ToastOptions {
  title?: string
  description?: string
  variant?: ToastVariant
}

export interface UseToastResult {
  toast: (options: ToastOptions) => void
}

/**
 * Backward-compatible toast hook used by legacy shadcn-style components.
 * Internally routes to Sonner, which is already the project standard.
 */
export const useToast = (): UseToastResult => {
  const toast = ({ title, description, variant = 'default' }: ToastOptions): void => {
    const message = title ?? ''

    if (variant === 'destructive') {
      sonnerToast.error(message, {
        description,
      })
      return
    }

    sonnerToast.success(message, {
      description,
    })
  }

  return { toast }
}

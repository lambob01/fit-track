import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  className?: string
  children: ReactNode
}

export function BottomSheet({ open, onClose, title, className, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) {
      return
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const sheet = sheetRef.current
    sheet?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || sheetRef.current === null) {
        return
      }

      const nodes = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((node) => node.offsetParent !== null)

      if (nodes.length === 0) {
        event.preventDefault()
        sheetRef.current.focus()
        return
      }

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === sheetRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        aria-hidden="true"
        onClick={handleBackdropClick}
        className="absolute inset-0 bg-black/60 light:bg-black/40"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'relative z-10 flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-xl outline-none',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2">
          {title !== undefined ? (
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl text-content-muted transition-colors hover:text-content"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

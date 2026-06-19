'use client'

import { Clock, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface SlowResponseNoticeProps {
  isOpen: boolean
  onClose: () => void
  onDontShowAgain: () => void
}

// A quiet, low-key notice shown when a response is taking longer than usual.
// Mirrors the neutral, low-saturation modal style used elsewhere on the site
// (see settings-modal.tsx) rather than a fleeting toast, so the reassurance
// is easy to read and easy to silence for good.
export function SlowResponseNotice({ isOpen, onClose, onDontShowAgain }: SlowResponseNoticeProps) {
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = (after?: () => void) => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
      after?.()
    }, 200)
  }

  // Reset the closing animation flag whenever the notice is re-opened.
  useEffect(() => {
    if (isOpen) setIsClosing(false)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={() => handleClose()}
      />

      {/* Modal Content */}
      <div
        className={`
          relative w-full max-w-sm bg-[var(--background)] dark:bg-[#191A1A]
          rounded-2xl border border-[var(--border-subtle)] shadow-2xl
          transform transition-all duration-200
          ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
      >
        <button
          onClick={() => handleClose()}
          aria-label="Close"
          className="absolute right-4 top-4 p-1 rounded-full hover:bg-[var(--secondary)] text-[var(--muted-foreground)] transition-colors"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]">
            <Clock size={18} strokeWidth={1.75} />
          </div>
          <h2 className="mt-4 text-base font-medium text-[var(--foreground)]">Still working on this one</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
            This is taking a little longer than usual. Feel free to step away — your answer will be here when you&apos;re back.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-5">
          <button
            onClick={() => handleClose(onDontShowAgain)}
            className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Don&apos;t show again
          </button>
          <button
            onClick={() => handleClose()}
            className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

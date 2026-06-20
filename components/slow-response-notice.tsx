'use client'

import { Clock, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface SlowResponseNoticeProps {
  isOpen: boolean
  onClose: () => void
  onDontShowAgain: () => void
}

// A restrained "still working" hint for slow responses. Rather than a centered
// modal that takes over the screen, this sits quietly in the bottom corner and
// never blocks interaction — neutral, low-saturation, easy to ignore or dismiss.
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
    <div
      role="status"
      className={`
        fixed bottom-4 left-1/2 z-[100] w-[calc(100vw-2rem)] max-w-xs -translate-x-1/2
        sm:left-auto sm:right-4 sm:translate-x-0
        rounded-xl border border-[var(--border-subtle)] bg-[var(--background)] dark:bg-[#191A1A]
        shadow-[0_6px_24px_rgba(0,0,0,0.10)]
        transition-all duration-200
        ${isClosing ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}
      `}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]">
          <Clock size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--foreground)]">Still working on this one</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
            Feel free to step away — your answer will be here when you&apos;re back.
          </p>
          <button
            onClick={() => handleClose(onDontShowAgain)}
            className="mt-2 text-[12px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Don&apos;t show again
          </button>
        </div>
        <button
          onClick={() => handleClose()}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

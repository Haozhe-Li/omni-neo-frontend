'use client'

import { Globe, ChevronRight, Lock } from 'lucide-react'
import { useAuth, useClerk } from '@clerk/nextjs'

interface ShareToPagesMenuProps {
  /**
   * Called when a signed-in user picks the row. The CALLER opens the
   * `PublishDialog` — see below.
   */
  onSelect: () => void
}

/**
 * "Publish to Pages" row for the hand-rolled Share dropdowns in
 * artifact-panel.tsx / chat-view.tsx / schedule-report-view.tsx. It is only a
 * trigger: every decision (duration, public/unlisted, the resulting link) lives
 * in `PublishDialog`, so this row never grows into its own form.
 *
 * It used to own the dialog's open state and render the dialog itself. Every
 * caller renders it INSIDE a dropdown that unmounts when it closes, and each
 * closed that dropdown the moment the dialog was requested — which unmounted
 * this component, and the dialog with it, before it could paint. Clicking
 * "Publish to Pages" appeared to do nothing. The dialog now belongs to the
 * caller, outside the dropdown, where closing the menu cannot take it down.
 */
export function ShareToPagesMenu({ onSelect }: ShareToPagesMenuProps) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()

  const handleClick = () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    onSelect()
  }

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-start gap-3 rounded-[13px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--sand)]"
    >
      <Globe size={15} className="mt-0.5 shrink-0 text-[var(--teal)]" strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-[var(--ink)]">Publish to Pages</span>
        <span className="mt-0.5 block text-[12px] text-[var(--ink-faint)]">Choose who can find it</span>
      </span>
      {!isSignedIn ? (
        <Lock size={12} className="mt-1 shrink-0 opacity-50" />
      ) : (
        <ChevronRight size={13} className="mt-1 shrink-0 opacity-40" />
      )}
    </button>
  )
}

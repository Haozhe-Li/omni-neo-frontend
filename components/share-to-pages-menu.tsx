'use client'

import { useState } from 'react'
import { Globe, ChevronRight, Lock } from 'lucide-react'
import { useAuth, useClerk } from '@clerk/nextjs'
import type { Source } from '@/lib/types'
import { PublishDialog } from '@/components/publish-dialog'

interface ShareToPagesMenuProps {
  title: string
  content: string
  /** Sources referenced by `[n]` in `content` — carried along so the published page can render citation badges instead of bare bracket numbers. */
  sources?: Source[]
  /**
   * Overrides what /api/publish hashes into the page id — see PublishDialog
   * for why (id collisions between independent sources sharing a title).
   */
  idSeed?: string
  /** Closes the parent Share dropdown when the publish dialog opens, so the two surfaces are never both visible at once. */
  onOpenDialog?: () => void
}

/**
 * "Publish to Pages" row for the hand-rolled Share dropdowns in
 * artifact-panel.tsx / chat-view.tsx / schedule-report-view.tsx. It's just a
 * trigger — every decision (duration, public/unlisted, the resulting link)
 * lives in PublishDialog, so this row never grows into its own form.
 */
export function ShareToPagesMenu({ title, content, sources, idSeed, onOpenDialog }: ShareToPagesMenuProps) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleClick = () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    onOpenDialog?.()
    setDialogOpen(true)
  }

  return (
    <>
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

      <PublishDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={title}
        content={content}
        sources={sources}
        idSeed={idSeed}
      />
    </>
  )
}

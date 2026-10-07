'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EllipsisVertical, Link2, Loader2, Pencil, Share, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/settings-dialog'
import { useApi } from '@/hooks/useApi'
import { useSharedLinks } from '@/hooks/useSharedLinks'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
// user_threads.title is VARCHAR(255).
const MAX_TITLE = 255

interface ThreadActionsProps {
  threadId: string
  title: string
  /** Opens the share dialog (owned by ChatView, which also opens it from the answer footer). */
  onShare: () => void
  /** Sharing is not offered on voice threads or locked ones; rename and delete still are. */
  canShare: boolean
  /** An answer is still streaming. Deleting then would race the write that saves it. */
  generating?: boolean
  onRenamed: (title: string) => void
  /** Called after the thread is gone, so the view can leave it. */
  onDeleted: () => void
  /** Positioning is the caller's business. */
  className?: string
}

/**
 * The thread's top-right controls: a Share button, and a three-dot menu for
 * everything else you do to the conversation itself — rename it, see and stop
 * its sharing, delete it.
 *
 * Deleting and renaming go to the same endpoints the sidebar uses, and tell it
 * through window events (`omni:thread:deleted`, `omni:title`) so its list updates
 * without a refetch — the sidebar and the thread are separate trees and share
 * nothing else.
 */
export function ThreadActions({ threadId, title, onShare, canShare, generating = false, onRenamed, onDeleted, className }: ThreadActionsProps) {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const { fetchWithAuth } = useApi()

  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // Only asked once the menu is opened, and only for signed-in users, who are
  // the only ones that can have links.
  const { links, loaded } = useSharedLinks({ threadId, enabled: menuOpen && !!isSignedIn && canShare })

  const startShare = () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    onShare()
  }

  const rename = async (next: string) => {
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}/title`, {
        method: 'PATCH',
        body: JSON.stringify({ title: next }),
      })
      if (!res.ok) {
        toast.error('Couldn’t rename this conversation')
        return false
      }
      onRenamed(next)
      window.dispatchEvent(new CustomEvent('omni:title', { detail: { threadId, title: next } }))
      toast.success('Renamed')
      return true
    } catch {
      toast.error('Couldn’t rename this conversation')
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${threadId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Couldn’t delete this conversation')
        return
      }
      window.dispatchEvent(new CustomEvent('omni:thread:deleted', { detail: { threadId } }))
      setDeleteOpen(false)
      toast.success('Conversation deleted')
      onDeleted()
    } catch {
      toast.error('Couldn’t delete this conversation')
    } finally {
      setBusy(false)
    }
  }

  const sharingLabel = !loaded ? 'Share or stop sharing' : links.length === 0 ? 'Not shared' : `Shared · ${links.length} ${links.length === 1 ? 'link' : 'links'}`

  return (
    <>
      <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
        {canShare && (
          <button
            onClick={startShare}
            className="omni-pill gap-1.5 px-3.5 py-1.5 text-[12.5px]"
            title="Share conversation"
          >
            <Share size={13} strokeWidth={2} />
            Share
          </button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="omni-pill h-[30px] w-[30px] justify-center px-0 py-0 data-[state=open]:border-[var(--teal)]"
              title="Conversation options"
              aria-label="Conversation options"
            >
              <EllipsisVertical size={15} strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-[264px] rounded-[18px] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-1.5 shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)]"
          >
            <DropdownMenuItem
              onSelect={() => setRenameOpen(true)}
              className="items-start gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] text-[var(--ink)] focus:bg-[var(--sand)]"
            >
              <Pencil size={15} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" strokeWidth={2} />
              Rename
            </DropdownMenuItem>
            {canShare && (
              <DropdownMenuItem
                onSelect={startShare}
                className="items-start gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] text-[var(--ink)] focus:bg-[var(--sand)]"
              >
                <Link2 size={15} className="mt-0.5 shrink-0 text-[var(--teal)]" strokeWidth={2} />
                <span>
                  <span className="block">Sharing</span>
                  <span className="mt-0.5 block text-[12px] text-[var(--ink-faint)]">{isSignedIn ? sharingLabel : 'Sign in to share'}</span>
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="my-1 bg-[var(--border-subtle)]/50" />
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              disabled={generating}
              className="items-start gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] text-red-500 focus:bg-red-500/10 focus:text-red-500"
            >
              <Trash2 size={15} className="mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                <span className="block">Delete</span>
                {generating && <span className="mt-0.5 block text-[12px] text-[var(--ink-faint)]">Wait for the answer to finish</span>}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameDialog
        isOpen={renameOpen}
        initial={title}
        busy={busy}
        onClose={() => setRenameOpen(false)}
        onSave={async (next) => {
          if (await rename(next)) setRenameOpen(false)
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this conversation?"
        description="It will be removed for good. Links you’ve shared from it keep working until you revoke them in Settings → Chat history."
        confirmLabel="Delete"
        onConfirm={remove}
        isPending={busy}
      />
    </>
  )
}

function RenameDialog({
  isOpen,
  initial,
  busy,
  onClose,
  onSave,
}: {
  isOpen: boolean
  initial: string
  busy: boolean
  onClose: () => void
  onSave: (title: string) => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    setValue(initial)
    // After the dialog paints, so the select-all lands on the field.
    const t = setTimeout(() => inputRef.current?.select(), 30)
    return () => clearTimeout(t)
  }, [isOpen, initial])

  if (!isOpen) return null
  const trimmed = value.trim()
  const canSave = !!trimmed && trimmed !== initial.trim() && !busy

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[var(--scrim)] animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-xl border border-border bg-background shadow-lg animate-in zoom-in-95 fade-in duration-200 ease-out">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="omni-display text-[22px] leading-tight text-[var(--ink)]">Rename conversation</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSave) onSave(trimmed)
          }}
        >
          <input
            ref={inputRef}
            value={value}
            maxLength={MAX_TITLE}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-[var(--teal)]"
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 flex-1 rounded-full text-sm">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSave}
              className="h-10 flex-1 rounded-full bg-[var(--teal)] text-sm text-[var(--accent-foreground)] transition-colors hover:bg-[var(--teal-hover)] disabled:opacity-50"
            >
              {busy ? <Loader2 className="animate-spin" /> : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

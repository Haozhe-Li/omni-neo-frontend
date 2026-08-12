'use client'

/**
 * The model dropdown, shared by the home screen and the chat composer.
 *
 * Extracted when Fast/Pro became a five-model catalog: the same list was
 * inlined twice per screen (desktop popover + mobile sheet), so four copies had
 * to agree on which entries are locked, what each costs, and which one refuses
 * images. One component, one source of truth (`lib/models.ts`).
 *
 * Locking has two independent causes and they read differently to the user:
 *
 *   auth   — signed-in-only model, guest is looking at it. Selecting it opens
 *            sign-up rather than silently doing nothing.
 *   usage  — allowance exhausted (guests only). Applies to every entry at once,
 *            so it is a property of the picker, not of a model.
 */

import { Check, ChevronDown, Lock, X } from 'lucide-react'
import { SignUpButton } from '@clerk/nextjs'

import { CHAT_MODELS, getModel, type ChatModelId } from '@/lib/models'

interface ModelPickerProps {
  model: ChatModelId
  onChange: (model: ChatModelId) => void
  open: boolean
  setOpen: (open: boolean) => void
  isSignedIn: boolean
  /** Usage allowance exhausted — guest-only, locks every entry uniformly. */
  locked?: boolean
  /**
   * Which way the desktop popover opens. `'up'` for the chat composer, which is
   * pinned to the bottom of the viewport — opening down there puts the list
   * below the fold with no way to scroll to it. The home screen's box sits
   * mid-page and has room underneath, so it stays `'down'`.
   *
   * Only affects desktop. The mobile variant is a bottom sheet fixed to the
   * viewport, so it is already on-screen from either call site.
   */
  placement?: 'up' | 'down'
  dropdownRef?: React.RefObject<HTMLDivElement | null>
}

/** Teal "New" chip. Uses the accent token so it tracks the theme rather than
 *  hardcoding a colour that breaks in dark mode. */
function NewChip() {
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--accent)]/12 text-[var(--accent)] leading-none">
      New
    </span>
  )
}

export function ModelPicker({
  model,
  onChange,
  open,
  setOpen,
  isSignedIn,
  locked = false,
  placement = 'down',
  dropdownRef,
}: ModelPickerProps) {
  const selected = getModel(model)

  const popoverPosition =
    placement === 'up'
      ? 'bottom-full mb-2 slide-in-from-bottom-2'
      : 'top-full mt-2 slide-in-from-top-2'

  const rows = CHAT_MODELS.map((m) => ({
    ...m,
    authLocked: m.requiresAuth && !isSignedIn,
  }))

  // A signed-in-only row keeps its own description — the lock icon already says
  // it is unavailable, and replacing the copy would mean a guest never sees
  // what any of these models actually are, which is most of the reason to list
  // them. The usage-exhausted state does override, because that one is a
  // temporary condition the user can act on rather than a property of the model.
  const describe = (m: (typeof rows)[number]) => {
    if (locked) return 'Usage limit reached — sign in for 10× more usage'
    return m.desc
  }

  // A locked row must not call `onChange` — the backend would 401 it. Wrapping
  // it in Clerk's SignUpButton turns the dead click into the action the user
  // actually needs.
  const Row = ({
    m,
    children,
  }: {
    m: (typeof rows)[number]
    children: React.ReactNode
  }) => {
    if (m.authLocked) {
      return (
        <SignUpButton mode="modal">
          <button type="button" onClick={() => setOpen(false)} className="w-full">
            {children}
          </button>
        </SignUpButton>
      )
    }
    return (
      <button
        type="button"
        onClick={() => {
          onChange(m.id)
          setOpen(false)
        }}
        className="w-full"
      >
        {children}
      </button>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors select-none"
      >
        {/* On the default, the collapsed control reads "Model" rather than
            "Best" — a lone "Best" gives no hint that the thing is a model
            picker at all. Any explicit choice shows its own name. */}
        <span>{model === 'best' ? 'Model' : selected.label}</span>
        {locked && (
          <>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] leading-none">
              Sign in
            </span>
            <Lock className="h-3 w-3" />
          </>
        )}
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          {/* Desktop popover */}
          <div
            className={`hidden md:block absolute right-0 ${popoverPosition} w-[300px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in duration-150`}
          >
            {rows.map((m) => (
              <Row key={m.id} m={m}>
                <div
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--secondary)]/50 ${
                    model === m.id ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
                  } ${m.authLocked ? 'opacity-60' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[14px] font-semibold leading-none">{m.label}</span>
                      {m.isNew && <NewChip />}
                      {(m.authLocked || locked) && <Lock className="h-3.5 w-3.5 opacity-60" />}
                    </div>
                    <div className="text-[11px] text-[var(--muted-foreground)] leading-snug line-clamp-2">
                      {describe(m)}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center justify-center w-5">
                    {model === m.id && (
                      <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
              </Row>
            ))}
          </div>

          {/* Mobile bottom sheet */}
          <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setOpen(false)}
            />
            <div className="relative bg-[var(--background)] border-t border-[var(--border)] rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-[var(--foreground)]">Select model</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Capped and scrollable: the list went from two entries to five,
                  which is tall enough to run past the bottom of a short phone
                  and clip the last row. */}
              <div className="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto overscroll-contain">
                {rows.map((m) => (
                  <Row key={m.id} m={m}>
                    <div
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left transition-colors bg-[var(--secondary)]/30 active:bg-[var(--secondary)]/60 ${
                        model === m.id
                          ? 'ring-[1.5px] ring-[var(--accent)] text-[var(--accent)]'
                          : 'border border-[var(--border-subtle)] text-[var(--foreground)]'
                      } ${m.authLocked ? 'opacity-60' : ''}`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[15px] font-medium flex items-center gap-1.5">
                          {m.label}
                          {m.isNew && <NewChip />}
                          {(m.authLocked || locked) && <Lock className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                          {describe(m)}
                        </span>
                      </div>
                      <div className="ml-3 shrink-0 flex items-center gap-2">
                        {model === m.id ? (
                          <div className="h-5 w-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div className="h-5 w-5 rounded-full border border-[var(--border)]" />
                        )}
                      </div>
                    </div>
                  </Row>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

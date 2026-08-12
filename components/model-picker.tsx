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

import type { ReactNode } from 'react'
import { Check, ChevronDown, Cpu, Lock, X } from 'lucide-react'
import Image from 'next/image'
import { SignUpButton } from '@clerk/nextjs'

import { CHAT_MODELS, getModel, type ChatModelId } from '@/lib/models'
import { cn } from '@/lib/utils'

/**
 * Each model's real maker mark rather than a generic glyph — Gemma/Gemini are
 * Google's, Luna is OpenAI's, Best/Rix are Omni's own. The brand marks render
 * in `currentColor` (single-path, no brand colors) so they pick up whatever
 * color the row around them is already using — active/locked/etc — the same
 * way the `Lock`/`Check` icons do. `best` reuses the chip icon Settings'
 * now-removed Model tab used for itself; nothing else in the app has claimed
 * it since.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 488 512" className={className} fill="currentColor" aria-hidden>
      <path d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
    </svg>
  )
}

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1686a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4592a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
    </svg>
  )
}

function OmniIcon({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-block', className)}>
      <Image src="/omni-logo-light.png" alt="" fill className="object-contain dark:hidden" />
      <Image src="/omni-logo-dark.png" alt="" fill className="object-contain hidden dark:block" />
    </span>
  )
}

function ModelIcon({ id, className }: { id: ChatModelId; className?: string }) {
  if (id === 'rix') return <OmniIcon className={className} />

  // The vector marks (chip glyph, Google "G", OpenAI mark) all draw edge-to-edge
  // in their viewBox, while Omni's PNG carries built-in padding around the
  // hexagon — at an identical box size they read both bigger and higher-contrast
  // than Omni's mark. `scale` brings their rendered size down to match without
  // touching the box itself (so the row's gap/alignment stay untouched), and
  // `opacity` backs off their currentColor fill from full-strength foreground.
  let icon: ReactNode
  if (id === 'luna') icon = <OpenAIIcon className="h-full w-full" />
  else if (id === 'gemma' || id === 'gemini') icon = <GoogleIcon className="h-full w-full" />
  else icon = <Cpu className="h-full w-full" />

  return (
    <span className={cn('inline-flex scale-[0.82] items-center justify-center opacity-95', className)}>
      {icon}
    </span>
  )
}

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
      Beta
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
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--secondary)]/50 ${
                    model === m.id ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
                  } ${m.authLocked ? 'opacity-60' : ''}`}
                >
                  {/* `items-start` on the row, not `items-center` — the
                      description can wrap to two lines, and centering the icon
                      across that whole block floats it away from the label
                      it's supposed to sit next to. `mt-0.5` instead lines it up
                      with the label's cap-height on the first line. */}
                  <ModelIcon id={m.id} className="h-[18px] w-[18px] shrink-0 mt-0.5" />
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
                  <div className="shrink-0 flex items-center justify-center w-5 mt-0.5">
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
                      className={`w-full flex items-start justify-between px-4 py-3.5 rounded-2xl text-left transition-colors bg-[var(--secondary)]/30 active:bg-[var(--secondary)]/60 ${
                        model === m.id
                          ? 'ring-[1.5px] ring-[var(--accent)] text-[var(--accent)]'
                          : 'border border-[var(--border-subtle)] text-[var(--foreground)]'
                      } ${m.authLocked ? 'opacity-60' : ''}`}
                    >
                      {/* `items-start`, not `items-center` — the description
                          regularly wraps to two lines at this width, and
                          centering the icon across that whole block floats it
                          away from the label instead of sitting next to it.
                          `mt-0.5` lines it (and the trailing indicator) up
                          with the label's cap-height on the first line. */}
                      <div className="flex items-start gap-3 min-w-0">
                        <ModelIcon id={m.id} className="h-5 w-5 shrink-0 mt-0.5" />
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
                      </div>
                      <div className="ml-3 mt-0.5 shrink-0 flex items-center gap-2">
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

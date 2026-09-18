'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, ShieldQuestionMark, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useApi } from '@/hooks/useApi'
import type { Credibility } from '@/lib/credibility'
import { safeLinkSeverity } from '@/lib/credibility'
import { classifyUrl } from '@/lib/link-classification'
import type { SafeLinkEventDetail } from '@/lib/safe-link-events'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function verdictHeadline(credibility: Credibility | null): string {
  switch (credibility?.label) {
    case 'arguable':
      return 'Disputed'
    case 'junk':
      return 'Low quality'
    default:
      return 'Unverified'
  }
}

/**
 * Global Safe-Links-style interstitial for outbound links the agent
 * surfaces. Mounted once (see `app-sidebar.tsx`) and driven entirely by the
 * `omni:safe-link` window event — same pattern as `UsageLimitDialog` — so
 * any `SafeLink` can trigger it without prop-drilling.
 *
 * Always a soft gate: "Visit anyway" is present in every phase, including
 * after a failed/timed-out classification, never a hard block.
 */
export function SafeLinkModal() {
  const { fetchWithAuth } = useApi()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<'checking' | 'verdict'>('checking')
  const [credibility, setCredibility] = useState<Credibility | null>(null)

  useEffect(() => {
    const onGate = (e: CustomEvent<SafeLinkEventDetail>) => {
      setUrl(e.detail.url)
      setOpen(true)
      if (e.detail.credibility) {
        setCredibility(e.detail.credibility)
        setPhase('verdict')
        return
      }
      setCredibility(null)
      setPhase('checking')
      classifyUrl(e.detail.url, fetchWithAuth).then((verdict) => {
        setCredibility(verdict)
        setPhase('verdict')
      })
    }
    window.addEventListener('omni:safe-link', onGate)
    return () => window.removeEventListener('omni:safe-link', onGate)
  }, [fetchWithAuth])

  const handleVisit = useCallback(() => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }, [url])

  if (!url) return null
  const severity = safeLinkSeverity(credibility)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-[var(--scrim)]"
        className="w-[92vw] max-w-[400px] gap-0 overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--paper)] p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">Confirm outbound link</DialogTitle>

        <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6 text-center">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              severity === 'warning' ? 'bg-[var(--warning)]/10' : 'bg-[var(--sand-deep)]'
            }`}
          >
            {severity === 'warning' ? (
              <TriangleAlert size={20} className="text-[var(--warning)]" />
            ) : (
              <ShieldQuestionMark size={20} className="text-[var(--ink-muted)]" />
            )}
          </div>

          <div className="space-y-1.5">
            <h2 className="omni-display text-[24px] leading-[1.2] text-[var(--ink)]">Before you go…</h2>
            <p className="break-all text-[14px] leading-[1.6] text-[var(--ink-muted)]">{hostOf(url)}</p>
          </div>

          {phase === 'checking' ? (
            <div className="flex items-center gap-2 py-2 text-[13px] text-[var(--ink-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this link…
            </div>
          ) : (
            <div className="w-full rounded-[12px] border-t border-[var(--line-hair)] bg-[var(--sand)] px-3 py-2 text-left">
              <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
                <span className={severity === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--ink)]'}>
                  {verdictHeadline(credibility)}:
                </span>{' '}
                {credibility?.reason}
              </p>
            </div>
          )}

          <div className="flex w-full flex-col gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="h-10 w-full rounded-full bg-[var(--teal)] text-sm text-[var(--accent-foreground)] transition-colors hover:bg-[var(--teal-hover)]"
            >
              Go back
            </button>
            <button
              onClick={handleVisit}
              disabled={phase === 'checking'}
              className="h-10 w-full rounded-full border border-[var(--line-strong)] text-sm text-[var(--ink)] transition-colors hover:bg-[var(--sand)] disabled:opacity-50"
            >
              Visit anyway
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

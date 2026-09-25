'use client'

import { useState } from 'react'
import { CalendarClock, Clock, Mail, Loader2, Check, X, AlertCircle } from 'lucide-react'
import type { ParsedScheduledResearch } from '@/lib/scheduled-research-parser'
import { buildCron, formatScheduleLabel } from '@/lib/cron'

interface ScheduledResearchBlockProps {
  data: ParsedScheduledResearch
  email: string
  isSignedIn: boolean
  backendUrl: string
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
  onSignIn: () => void
  /** Sends a message into the thread reporting the user's decision — same
   *  idiom as `<question>`'s `onSubmit`, just with a fixed pair of outcomes
   *  instead of a formatted form answer. */
  onDecision: (message: string) => void
  /** True once a user message already follows this block in history — the
   *  decision was already made (possibly in an earlier session). */
  answered?: boolean
  answeredText?: string
}

export function ScheduledResearchSkeleton() {
  return (
    <div className="mt-3 w-full max-w-[520px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--paper-raised)] overflow-hidden animate-pulse">
      <div className="flex items-center gap-2.5 px-[18px] py-3 border-b border-[var(--line-hair)]">
        <div className="h-[15px] w-40 rounded-md bg-foreground/[0.07]" />
      </div>
      <div className="px-[18px] py-4 space-y-2.5">
        <div className="h-4 w-2/3 rounded-md bg-foreground/[0.07]" />
        <div className="h-3 w-1/3 rounded-md bg-foreground/[0.05]" />
        <div className="h-10 w-full rounded-lg bg-foreground/[0.04]" />
      </div>
    </div>
  )
}

export function ScheduledResearchBlock({
  data,
  email,
  isSignedIn,
  backendUrl,
  fetchWithAuth,
  onSignIn,
  onDecision,
  answered = false,
  answeredText,
}: ScheduledResearchBlockProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'declined' | 'confirmed'>(
    answered ? 'confirmed' : 'idle'
  )
  const [error, setError] = useState<string | null>(null)

  const config = { frequency: data.frequency, time: data.time, weekday: data.weekday, dayOfMonth: data.dayOfMonth }
  const scheduleLabel = formatScheduleLabel(config)

  const handleDecline = () => {
    if (status !== 'idle') return
    setStatus('declined')
    onDecision(`I decided not to set up the scheduled research "${data.title}" right now.`)
  }

  const handleConfirm = async () => {
    if (status !== 'idle' || !isSignedIn) return
    setStatus('submitting')
    setError(null)
    try {
      const cron_schedule = buildCron(config)
      const res = await fetchWithAuth(`${backendUrl}/schedule_task`, {
        method: 'POST',
        body: JSON.stringify({
          name: data.title,
          prompt: data.prompt,
          cron_schedule,
          email,
          schedule_label: scheduleLabel,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.detail || 'Failed to create the scheduled task.')
      }
      setStatus('confirmed')
      onDecision(
        `I confirmed the scheduled research "${data.title}" — it'll run ${
          scheduleLabel.charAt(0).toLowerCase() + scheduleLabel.slice(1)
        } and reports will be emailed to ${email}.`
      )
    } catch (err: any) {
      setStatus('idle')
      setError(err?.message || 'Something went wrong — try again.')
    }
  }

  // ── Answered / read-only ────────────────────────────────────────────────
  if (answered) {
    const declined = !!answeredText && /decided not to/i.test(answeredText)
    return (
      <div className="mt-3 w-full max-w-[520px] flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--paper-raised)] px-4 py-3.5">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            declined ? 'bg-foreground/[0.08]' : 'bg-accent/12'
          }`}
        >
          {declined ? (
            <X className="h-3 w-3 text-muted-foreground" strokeWidth={3} />
          ) : (
            <Check className="h-3 w-3 text-accent" strokeWidth={3} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted-foreground/70 mb-1.5 leading-none">
            {data.title} · {scheduleLabel}
          </p>
          <p className="text-[14px] text-foreground leading-snug whitespace-pre-wrap">
            {answeredText || (declined ? 'Declined.' : 'Confirmed.')}
          </p>
        </div>
      </div>
    )
  }

  // ── Interactive proposal card ───────────────────────────────────────────
  const busy = status === 'submitting'
  return (
    <div className="mt-3 w-full max-w-[520px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--paper-raised)] overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2.5 px-[18px] py-3 border-b border-[var(--line-hair)] text-muted-foreground">
        <CalendarClock size={15} strokeWidth={1.75} className="shrink-0" />
        <span className="text-[13px] font-medium opacity-90 text-foreground">Scheduled research proposal</span>
      </div>

      <div className="px-[18px] py-4 space-y-3">
        <div>
          <p className="text-[15px] font-medium text-foreground leading-snug">{data.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Clock size={12} className="shrink-0" />
            {scheduleLabel} · your local time
          </p>
        </div>

        <div className="rounded-lg bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] px-3.5 py-2.5 text-[13.5px] text-foreground leading-relaxed whitespace-pre-wrap max-h-[160px] overflow-y-auto custom-scrollbar">
          {data.prompt}
        </div>

        <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Mail size={12} className="shrink-0" />
          {isSignedIn ? (
            <span className="truncate">Reports will be emailed to {email || 'your account email'}</span>
          ) : (
            <span>Sign in to receive reports by email</span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-[12.5px] text-red-500">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-[18px] pb-4 pt-1">
        <button
          type="button"
          onClick={handleDecline}
          disabled={busy}
          className="omni-pill h-8 gap-1.5 px-3.5 py-0 text-[12.5px] disabled:pointer-events-none disabled:opacity-40"
        >
          Not now
        </button>
        {isSignedIn ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="omni-pill omni-pill-solid h-8 gap-1.5 px-3.5 py-0 text-[12.5px] disabled:pointer-events-none disabled:opacity-60"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="omni-pill omni-pill-solid h-8 gap-1.5 px-3.5 py-0 text-[12.5px]"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  )
}

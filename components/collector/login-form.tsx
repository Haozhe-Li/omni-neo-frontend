'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

const INPUT =
  'w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--teal)]'

export function LoginForm() {
  const [annotator, setAnnotator] = useState(() => {
    try { return localStorage.getItem('omni_collector_name') ?? '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/collect/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotator, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not sign in.')
        return
      }
      try { localStorage.setItem('omni_collector_name', annotator.trim().toLowerCase()) } catch {}
      window.location.href = '/collect'
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-[360px] space-y-5">
      <div className="space-y-1">
        <h1 className="font-[family-name:var(--font-instrument)] text-[32px] leading-none text-[var(--ink)]">Collector</h1>
        <p className="text-[13px] text-[var(--ink-muted)]">Training-data collection. Restricted.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="annotator" className="omni-eyebrow">Your name</label>
        <input id="annotator" className={INPUT} value={annotator} onChange={(e) => setAnnotator(e.target.value)}
          autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="e.g. haozhe" required />
        <p className="text-[11.5px] text-[var(--ink-muted)]">Only labels the examples you collect.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="omni-eyebrow">Password</label>
        <input id="password" type="password" className={INPUT} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="text-[13px] text-[var(--rust)]">{error}</p>}
      <button type="submit" disabled={busy || !annotator || !password}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--teal)] px-5 py-2.5 text-[14px] text-[var(--accent-foreground)] transition-all hover:bg-[var(--teal-hover)] disabled:opacity-40">
        {busy && <Loader2 size={14} className="animate-spin" />} Sign in
      </button>
    </form>
  )
}

'use client'

import { useState } from 'react'
import { Globe, ChevronDown, Loader2, Check, Copy, ExternalLink, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth, useClerk } from '@clerk/nextjs'
import type { PublishDuration } from '@/lib/types'

interface ShareToPagesMenuProps {
  title: string
  content: string
}

const DURATIONS: { value: PublishDuration; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'permanent', label: 'Forever' },
]

/**
 * "Share to Pages" row + expand-in-place panel for the hand-rolled Share
 * dropdowns in artifact-panel.tsx / chat-view.tsx. Matches their existing
 * flat, low-saturation menu styling rather than pulling in Radix.
 */
export function ShareToPagesMenu({ title, content }: ShareToPagesMenuProps) {
  const { isSignedIn } = useAuth()
  const clerk = useClerk()
  const [expanded, setExpanded] = useState(false)
  const [checking, setChecking] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [duration, setDuration] = useState<PublishDuration>('permanent')
  const [publishToPages, setPublishToPages] = useState(true)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const handleToggle = async () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!shareUrl) {
      setChecking(true)
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, checkOnly: true }),
        })
        if (res.ok) {
          const { id, exists } = await res.json()
          if (exists) setShareUrl(`${window.location.origin}/pages/${id}`)
        }
      } catch (e) {
        console.error('Check share status failed', e)
      } finally {
        setChecking(false)
      }
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, answer: content, duration, publishToPages, forceUpdate: true }),
      })
      if (!res.ok) throw new Error('publish failed')
      const { id } = await res.json()
      const url = `${window.location.origin}/pages/${id}`
      setShareUrl(url)
      await copyUrl(url)
      toast.success('Published — link copied')
    } catch (e) {
      console.error('Publish failed', e)
      toast.error('Failed to publish to Pages')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="flex flex-col">
      <button
        onClick={handleToggle}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-[13px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/80 transition-colors text-left ${expanded ? 'bg-[var(--secondary)]/60' : ''}`}
      >
        <Globe size={14} className="text-[var(--muted-foreground)]" strokeWidth={2} />
        {shareUrl ? 'Manage Pages Share' : 'Share to Pages'}
        {!isSignedIn ? (
          <Lock size={12} className="ml-auto opacity-50" />
        ) : (
          <ChevronDown size={13} className={`ml-auto opacity-50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {expanded && isSignedIn && (
        <div className="mx-2 mb-1.5 mt-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          {checking ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6">
              <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : !shareUrl ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--card)] p-0.5">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={`flex-1 rounded-[6px] py-1.5 text-[11.5px] font-medium transition-colors ${
                      duration === d.value
                        ? 'bg-[var(--foreground)] text-[var(--background)]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
                <div className="relative flex items-center justify-center shrink-0">
                  <input
                    type="checkbox"
                    checked={publishToPages}
                    onChange={(e) => setPublishToPages(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-4 h-4 rounded border border-[var(--border)] bg-[var(--card)] peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] transition-colors" />
                  <Check className="w-3 h-3 text-white absolute inset-0 m-auto opacity-0 peer-checked:opacity-100 transition-opacity" strokeWidth={3} />
                </div>
                <span className="text-[12px] text-[var(--foreground)] group-hover:opacity-80 transition-opacity">
                  List on Pages home
                </span>
              </label>

              <button
                onClick={handlePublish}
                disabled={publishing}
                className="w-full h-8 rounded-md bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {publishing ? <Loader2 size={13} className="animate-spin" /> : 'Publish & Copy Link'}
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2.5">
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--card)] px-2.5 py-2 text-[11px] font-mono break-all leading-tight text-[var(--foreground)]">
                {shareUrl}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { copyUrl(shareUrl); toast.success('Link copied') }}
                  className="flex-1 h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[11.5px] font-medium text-[var(--foreground)] flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} className="opacity-70" />}
                  Copy
                </button>
                <button
                  onClick={() => window.open(shareUrl, '_blank')}
                  className="flex-1 h-7 rounded-md border border-[var(--border-subtle)] bg-[var(--card)] hover:bg-[var(--secondary)] text-[11.5px] font-medium text-[var(--foreground)] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink size={12} className="opacity-70" />
                  Open
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

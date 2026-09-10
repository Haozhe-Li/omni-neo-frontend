'use client'

import { useState } from 'react'
import { Check, Copy, FileText, Loader2, Mail, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { ParsedTextBlock } from '@/lib/textblock-parser'

function copyTextFor(block: ParsedTextBlock): string {
  if (block.kind === 'email') {
    return `Subject: ${block.subject || '(no subject)'}\n\n${block.content}`
  }
  return block.content
}

export function TextBlockCard({ block }: { block: ParsedTextBlock }) {
  const [copied, setCopied] = useState(false)
  const isEmail = block.kind === 'email'

  const handleCopy = () => {
    navigator.clipboard.writeText(copyTextFor(block))
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 1500)
  }

  const mailtoHref = `mailto:?subject=${encodeURIComponent(block.subject || '')}&body=${encodeURIComponent(block.content)}`

  return (
    <div className="relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line-hair)] px-[18px] py-3">
        <div className="flex items-center gap-2.5 min-w-0 text-[var(--muted-foreground)]">
          {isEmail ? <Mail size={15} strokeWidth={1.75} className="shrink-0" /> : <FileText size={15} strokeWidth={1.75} className="shrink-0" />}
          <span className="text-[13px] font-medium truncate opacity-90 text-[var(--foreground)]">
            {isEmail ? 'Email draft' : 'Draft'}
          </span>
          {!block.complete && <Loader2 size={13} strokeWidth={2} className="animate-spin shrink-0 text-[var(--muted-foreground)]" />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isEmail && (
            <a
              href={block.complete ? mailtoHref : undefined}
              aria-disabled={!block.complete}
              className={`omni-pill omni-pill-solid h-7 gap-1.5 px-3 py-0 text-[12.5px] transition-opacity ${
                block.complete ? 'hover:opacity-90' : 'opacity-40 pointer-events-none'
              }`}
            >
              <Send size={12} strokeWidth={2} />
              Send
            </a>
          )}
          <button
            onClick={handleCopy}
            disabled={!block.complete}
            className="omni-pill h-7 gap-1.5 px-3 py-0 text-[12.5px] disabled:pointer-events-none disabled:opacity-40"
          >
            {copied ? <Check size={12} strokeWidth={2} className="text-[var(--teal)]" /> : <Copy size={12} strokeWidth={2} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="px-4 py-3.5">
        {isEmail && (
          <div className="mb-2.5 flex min-w-0 items-baseline gap-1.5 border-b border-[var(--line-hair)] pb-2.5">
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]/70 font-medium">Subject</span>
            <span className="text-[14px] font-medium text-[var(--foreground)] truncate">{block.subject || '(no subject)'}</span>
          </div>
        )}
        <div className="text-[14px] leading-relaxed text-[var(--foreground)] whitespace-pre-wrap">
          {block.content || (!block.complete ? '···' : '')}
        </div>
      </div>
    </div>
  )
}

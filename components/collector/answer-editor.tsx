'use client'

import { useRef } from 'react'
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, RotateCcw } from 'lucide-react'
import { MarkdownMessage } from '@/components/markdown-message'
import type { Source } from '@/lib/types'

type Wrap = { before: string; after: string; placeholder: string }

const WRAPS: Record<string, Wrap> = {
  bold: { before: '**', after: '**', placeholder: 'bold' },
  italic: { before: '*', after: '*', placeholder: 'italic' },
  code: { before: '`', after: '`', placeholder: 'code' },
  link: { before: '[', after: '](https://)', placeholder: 'text' },
}

/**
 * A markdown editor for the model's answer: the raw text on one side, the real
 * renderer (the same MarkdownMessage the chat uses, citations and all) on the other.
 *
 * Deliberately a plain textarea over the *raw* markdown. Answers carry things a rich
 * editor would normalize away — `[1]` citation markers, ```echarts fences,
 * `<report>` blocks — and those are part of what the model is trained to emit, so
 * what is typed here is what is stored, byte for byte.
 */
export function AnswerEditor({
  value,
  original,
  saved,
  onChange,
  sources,
  disabled,
}: {
  value: string
  /** The model's own answer, before any edit. */
  original: string
  /** What the checkpoint holds now (equal to `original` until an edit is saved). */
  saved: string
  onChange: (next: string) => void
  sources: Source[]
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  /** Run `edit` on the selection and put the caret back where it makes sense. */
  const apply = (edit: (text: string, start: number, end: number) => { text: string; start: number; end: number }) => {
    const el = ref.current
    if (!el) return
    const r = edit(value, el.selectionStart, el.selectionEnd)
    onChange(r.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.start, r.end)
    })
  }

  const wrap = (w: Wrap) =>
    apply((t, s, e) => {
      const sel = t.slice(s, e) || w.placeholder
      const text = t.slice(0, s) + w.before + sel + w.after + t.slice(e)
      return { text, start: s + w.before.length, end: s + w.before.length + sel.length }
    })

  /** Prefix every line the selection touches. */
  const prefixLines = (prefix: (i: number) => string) =>
    apply((t, s, e) => {
      const from = t.lastIndexOf('\n', s - 1) + 1
      const toNl = t.indexOf('\n', e)
      const to = toNl === -1 ? t.length : toNl
      const lines = t.slice(from, to).split('\n').map((l, i) => prefix(i) + l)
      const block = lines.join('\n')
      return { text: t.slice(0, from) + block + t.slice(to), start: from, end: from + block.length }
    })

  const onKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'b') { ev.preventDefault(); wrap(WRAPS.bold) }
    else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'i') { ev.preventDefault(); wrap(WRAPS.italic) }
    else if (ev.key === 'Tab') {
      ev.preventDefault()
      apply((t, s, e) => ({ text: t.slice(0, s) + '  ' + t.slice(e), start: s + 2, end: s + 2 }))
    }
  }

  const modified = value !== original
  const unsaved = value !== saved

  const Tool = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="rounded-md p-1.5 text-[var(--ink-muted)] transition-colors hover:bg-[var(--sand)] hover:text-[var(--ink)] disabled:opacity-40">
      {children}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--paper-raised)]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--line)] px-2 py-1.5">
        <Tool title="Heading" onClick={() => prefixLines(() => '## ')}><Heading2 size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Bold (Ctrl/⌘ B)" onClick={() => wrap(WRAPS.bold)}><Bold size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Italic (Ctrl/⌘ I)" onClick={() => wrap(WRAPS.italic)}><Italic size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Inline code" onClick={() => wrap(WRAPS.code)}><Code size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Link" onClick={() => wrap(WRAPS.link)}><Link2 size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Bulleted list" onClick={() => prefixLines(() => '- ')}><List size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)}><ListOrdered size={15} strokeWidth={1.75} /></Tool>
        <Tool title="Quote" onClick={() => prefixLines(() => '> ')}><Quote size={15} strokeWidth={1.75} /></Tool>
        <div className="ml-auto flex items-center gap-2 pr-1 text-[12px]">
          {modified && <span className="rounded-full bg-[var(--rust-tint)] px-2 py-0.5 text-[var(--rust)]">edited</span>}
          {unsaved && <span className="text-[var(--ink-faint)]">not saved yet</span>}
          <button type="button" onClick={() => onChange(original)} disabled={disabled || !modified}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[var(--ink-muted)] hover:bg-[var(--sand)] disabled:opacity-40"
            title="Put the model's original answer back">
            <RotateCcw size={12} strokeWidth={1.75} /> Original
          </button>
        </div>
      </div>

      <div className="grid min-h-[360px] grid-cols-1 divide-y divide-[var(--line)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          spellCheck={false}
          className="min-h-[360px] w-full resize-y bg-transparent p-4 font-[family-name:var(--font-plex-mono)] text-[13px] leading-[1.65] text-[var(--ink)] outline-none"
          aria-label="Answer markdown"
        />
        <div className="max-h-[70vh] min-h-[360px] overflow-y-auto p-4">
          {value.trim()
            ? <MarkdownMessage content={value} sources={sources} />
            : <p className="text-[13px] text-[var(--ink-faint)]">Nothing to preview.</p>}
        </div>
      </div>
    </div>
  )
}

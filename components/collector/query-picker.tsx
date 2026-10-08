'use client'

import { useMemo } from 'react'
import { Dices } from 'lucide-react'
import { PREPARED_QUERIES, type PreparedQuery } from '@/lib/collector/queries'
import { categories, pool, type QueryFilter } from '@/lib/collector/query-pool'

const SELECT =
  'rounded-lg border border-[var(--line-strong)] bg-[var(--paper-raised)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--teal)]'

const BLOCK_NOTE: Record<string, string> = {
  requested_skill: 'a skill was picked first',
  user_memory: 'had a memory block',
  attached_files: 'needed an attachment',
  priority_sources: 'needed a pinned URL',
  follow_up_selection: 'quoted the last answer',
}

/**
 * Draw a query from the prepared set (lib/collector/queries.ts), at random or by hand.
 * "Used" is the set of ids already run, kept by the page so a reload does not forget it.
 */
export function QueryPicker({
  filter, onFilter, used, onRandom, onRandomAll, onPick, onResetUsed, drawn,
}: {
  filter: QueryFilter
  onFilter: (f: QueryFilter) => void
  used: ReadonlySet<string>
  onRandom: () => void
  onRandomAll: () => void
  onPick: (q: PreparedQuery) => void
  onResetUsed: () => void
  drawn: PreparedQuery | null
}) {
  const cats = useMemo(() => categories(filter), [filter])
  const inFilter = useMemo(() => pool(filter), [filter])
  const left = inFilter.filter((q) => !used.has(q.id)).length
  const grouped = useMemo(() => {
    const m = new Map<string, PreparedQuery[]>()
    for (const q of inFilter) m.set(q.cat, [...(m.get(q.cat) ?? []), q])
    return [...m]
  }, [inFilter])

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRandom}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-1.5 text-[12.5px] text-[var(--ink)] transition-all hover:bg-[var(--sand)] active:scale-95">
          <Dices size={14} strokeWidth={1.75} /> Random query
        </button>
        <button type="button" onClick={onRandomAll} title="Draw a query and shuffle the context (locks respected)"
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--teal-tint)] px-3 py-1.5 text-[12.5px] text-[var(--teal)] transition-all hover:opacity-90 active:scale-95">
          <Dices size={14} strokeWidth={1.75} /> Random query + context
        </button>
        <span className="ml-auto text-[12px] tabular-nums text-[var(--ink-muted)]">
          {left} of {inFilter.length} left
          {used.size > 0 && <button type="button" onClick={onResetUsed} className="ml-2 underline underline-offset-2 hover:text-[var(--ink)]">reset used</button>}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={SELECT} value={filter.cat} onChange={(e) => onFilter({ ...filter, cat: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.cat} value={c.cat}>{c.cat} ({c.n})</option>)}
        </select>
        <select className={SELECT} value={filter.lang} onChange={(e) => onFilter({ ...filter, lang: e.target.value as QueryFilter['lang'] })} aria-label="Language">
          <option value="">Any language</option>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
        <select className={`${SELECT} min-w-0 max-w-[260px] flex-1`} value="" aria-label="Pick one"
          onChange={(e) => { const q = PREPARED_QUERIES.find((x) => x.id === e.target.value); if (q) onPick(q) }}>
          <option value="">Pick one…</option>
          {grouped.map(([cat, qs]) => (
            <optgroup key={cat} label={cat}>
              {qs.map((q) => <option key={q.id} value={q.id}>{used.has(q.id) ? '✓ ' : ''}{q.text.slice(0, 60)}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)]" title="Some prepared queries were designed around an attachment, a pinned URL or a quoted passage, which the collector has no field for">
          <input type="checkbox" checked={filter.skipUnavailable} onChange={(e) => onFilter({ ...filter, skipUnavailable: e.target.checked })} />
          skip ones that need an attachment / URL / quote
        </label>
      </div>

      {drawn && (
        <p className="font-[family-name:var(--font-plex-mono)] text-[11.5px] text-[var(--ink-faint)]">
          {drawn.id} · {drawn.cat} · {drawn.lang}{drawn.block ? ` · originally: ${BLOCK_NOTE[drawn.block] ?? drawn.block}` : ''}
        </p>
      )}
    </div>
  )
}

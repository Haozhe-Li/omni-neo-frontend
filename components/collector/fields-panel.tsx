'use client'

import { Dices, Lock, Unlock } from 'lucide-react'
import {
  LANGUAGES,
  MAX_MEMORY_CHARS,
  MEMORY_SAMPLES,
  PLACES,
  SKILLS,
  TIME_RANGES,
  formatLocation,
  isoAtOffset,
  offsetOfIso,
  type CollectorFields,
  type FieldKey,
  type LocationKind,
  type TimeRange,
} from '@/lib/collector/fields'

const INPUT =
  'w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-60'

function Row({
  label,
  hint,
  field,
  locked,
  onLock,
  onShuffle,
  shuffleDisabled,
  children,
}: {
  label: string
  hint?: string
  field: FieldKey
  locked: boolean
  onLock: (f: FieldKey) => void
  onShuffle: (f: FieldKey) => void
  shuffleDisabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="omni-eyebrow">{label}</label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title={locked ? 'Locked: Shuffle all leaves this alone' : 'Lock against Shuffle all'}
            onClick={() => onLock(field)}
            className={`rounded-full p-1.5 transition-colors hover:bg-[var(--sand)] ${locked ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'}`}
          >
            {locked ? <Lock size={14} strokeWidth={1.75} /> : <Unlock size={14} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            title={`Shuffle ${label.toLowerCase()}`}
            disabled={shuffleDisabled}
            onClick={() => onShuffle(field)}
            className="rounded-full p-1.5 text-[var(--ink-faint)] transition-all hover:bg-[var(--sand)] hover:text-[var(--ink)] active:scale-95 disabled:opacity-40"
          >
            <Dices size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {children}
      {hint && <p className="text-[11.5px] leading-snug text-[var(--ink-muted)]">{hint}</p>}
    </div>
  )
}

export interface FieldsPanelProps {
  fields: CollectorFields
  onChange: (patch: Partial<CollectorFields>) => void
  locked: Partial<Record<FieldKey, boolean>>
  onToggleLock: (f: FieldKey) => void
  onShuffleField: (f: FieldKey) => void
  onShuffleAll: () => void
  range: TimeRange
  onRangeChange: (r: TimeRange) => void
  /** Memory is injected on the first turn only; later turns show it read-only. */
  memoryAllowed: boolean
  disabled?: boolean
  errors: string[]
}

export function FieldsPanel(p: FieldsPanelProps) {
  const { fields, onChange } = p

  const setKind = (kind: LocationKind) => {
    const m = /^(.+?), (.+) \((?:IP Approximate|GPS Precise Location)\)$/.exec(fields.location)
    if (m) onChange({ location: formatLocation({ city: m[1], country: m[2] }, kind) })
  }
  const currentKind: LocationKind | null = fields.location.endsWith('(GPS Precise Location)')
    ? 'gps'
    : fields.location.endsWith('(IP Approximate)')
      ? 'ip'
      : null

  const nowHere = () => {
    const off = offsetOfIso(fields.datetime) ?? -new Date().getTimezoneOffset()
    onChange({ datetime: isoAtOffset(Date.now(), off) })
  }

  return (
    <fieldset disabled={p.disabled} className="space-y-5 disabled:opacity-70">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-instrument)] text-[22px] leading-none text-[var(--ink)]">Context</h2>
        <button
          type="button"
          onClick={p.onShuffleAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-1.5 text-[12.5px] text-[var(--ink)] transition-all hover:bg-[var(--sand)] active:scale-95"
        >
          <Dices size={14} strokeWidth={1.75} />
          Shuffle all
        </button>
      </div>
      <p className="-mt-2 text-[12px] leading-snug text-[var(--ink-muted)]">
        Exactly what Omni is told about the user. Formats are the production ones — the backend rejects anything else.
      </p>

      <Row label="Time" field="datetime" locked={!!p.locked.datetime} onLock={p.onToggleLock} onShuffle={p.onShuffleField}
        hint={TIME_RANGES.find((r) => r.value === p.range)?.hint}>
        <input
          className={`${INPUT} font-[family-name:var(--font-plex-mono)] text-[12.5px]`}
          value={fields.datetime}
          onChange={(e) => onChange({ datetime: e.target.value.trim() })}
          spellCheck={false}
          placeholder="2026-10-07T14:05:09+08:00"
        />
        <div className="flex items-center gap-2">
          <select
            className={`${INPUT} py-1.5 text-[12px]`}
            value={p.range}
            onChange={(e) => p.onRangeChange(e.target.value as TimeRange)}
            title="How far from now Shuffle may land"
          >
            {TIME_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button type="button" onClick={nowHere}
            className="shrink-0 rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 text-[12px] text-[var(--ink-soft)] hover:bg-[var(--sand)]">
            Now
          </button>
        </div>
      </Row>

      <Row label="Location" field="location" locked={!!p.locked.location} onLock={p.onToggleLock} onShuffle={p.onShuffleField}
        hint="Empty = the user's location is unknown (the line is left out).">
        <input
          className={INPUT}
          value={fields.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Tokyo, Japan (IP Approximate)"
        />
        <div className="flex items-center gap-2">
          <select
            className={`${INPUT} py-1.5 text-[12px]`}
            value=""
            onChange={(e) => {
              const place = PLACES[Number(e.target.value)]
              if (place) onChange({ location: formatLocation(place, currentKind ?? 'ip') })
            }}
          >
            <option value="">Pick a place…</option>
            {PLACES.map((pl, i) => <option key={`${pl.city}-${pl.country}`} value={i}>{pl.city}, {pl.country}</option>)}
          </select>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-[var(--line-strong)] text-[12px]">
            {(['ip', 'gps'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} disabled={!currentKind}
                className={`px-2.5 py-1.5 uppercase disabled:opacity-40 ${currentKind === k ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 'text-[var(--ink-soft)] hover:bg-[var(--sand)]'}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
      </Row>

      <Row label="Answer language" field="language" locked={!!p.locked.language} onLock={p.onToggleLock} onShuffle={p.onShuffleField}>
        <select className={INPUT} value={fields.language} onChange={(e) => onChange({ language: e.target.value as CollectorFields['language'] })}>
          {LANGUAGES.map((l) => <option key={l.value || 'auto'} value={l.value}>{l.label}</option>)}
        </select>
      </Row>

      <Row label="Skill" field="skill" locked={!!p.locked.skill} onLock={p.onToggleLock} onShuffle={p.onShuffleField}
        hint="The skill switched on in the chat's picker for this turn. It stays on until you clear it, as in the product.">
        <select className={INPUT} value={fields.skill} onChange={(e) => onChange({ skill: e.target.value as CollectorFields['skill'] })}>
          {SKILLS.map((k) => <option key={k.value || 'none'} value={k.value}>{k.label}</option>)}
        </select>
      </Row>

      <Row label="Memory" field="memory" locked={!!p.locked.memory} onLock={p.onToggleLock} onShuffle={p.onShuffleField}
        shuffleDisabled={!p.memoryAllowed}
        hint={p.memoryAllowed
          ? 'Becomes the <user_memory> block of the first turn. Empty = no block.'
          : 'Memory is injected on the first turn only, so it is read-only now.'}>
        <textarea
          className={`${INPUT} min-h-[150px] resize-y leading-relaxed`}
          value={fields.memory}
          onChange={(e) => onChange({ memory: e.target.value })}
          disabled={!p.memoryAllowed}
          placeholder={'## Profile\n- …\n\n## Preferences\n- …'}
          spellCheck={false}
        />
        <div className="flex items-center justify-between gap-2">
          <select
            className={`${INPUT} py-1.5 text-[12px]`}
            value=""
            disabled={!p.memoryAllowed}
            onChange={(e) => {
              const s = MEMORY_SAMPLES[Number(e.target.value)]
              if (s) onChange({ memory: s })
            }}
          >
            <option value="">Insert a sample…</option>
            {MEMORY_SAMPLES.map((s, i) => <option key={i} value={i}>{s.split('\n').find((l) => l.startsWith('- '))?.slice(2, 48) ?? `Sample ${i + 1}`}</option>)}
          </select>
          <span className={`shrink-0 text-[11.5px] tabular-nums ${fields.memory.trim().length > MAX_MEMORY_CHARS ? 'text-[var(--destructive)]' : 'text-[var(--ink-faint)]'}`}>
            {fields.memory.trim().length}/{MAX_MEMORY_CHARS}
          </span>
        </div>
      </Row>

      {p.errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-[var(--rust)]/30 bg-[var(--rust-tint)] px-3 py-2 text-[12px] text-[var(--rust)]">
          {p.errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
    </fieldset>
  )
}

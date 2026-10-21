'use client'

import { Check } from 'lucide-react'
import type { TodoItem } from '@/lib/types'

interface ResearchProgressProps {
  /** The agent's latest `write_todos` plan, as streamed. */
  todos: TodoItem[]
  /**
   * The answer has landed. Every item is drawn as completed from here on,
   * whatever the last `write_todos` call said: the agent rarely sends a final
   * "all done" update before it starts writing, so the plan would otherwise
   * freeze half-ticked under a finished answer.
   */
  done: boolean
}

// How long one item's tick lags the one above it when `done` flips, so the
// list checks itself off top to bottom instead of snapping all at once.
const TICK_STAGGER_MS = 70

export function ResearchProgress({ todos, done }: ResearchProgressProps) {
  const items: TodoItem[] = done ? todos.map((t) => ({ ...t, status: 'completed' })) : todos

  return (
    <div className="omni-trace mt-3 px-5 py-4" style={{ animation: 'omni-rise 240ms ease both' }}>
      {items.length === 0 ? (
        // The skill has loaded but the plan hasn't arrived yet.
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 shrink-0 rounded-full bg-[var(--line)]" style={{ animation: 'omni-soft-pulse 1.4s ease-in-out infinite' }} />
              <div
                className="h-2.5 rounded-full bg-[var(--line)]"
                style={{ width: `${68 - i * 16}%`, animation: 'omni-soft-pulse 1.4s ease-in-out infinite' }}
              />
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((todo, i) => (
            <TodoRow key={i} todo={todo} delayMs={done ? i * TICK_STAGGER_MS : 0} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TodoRow({ todo, delayMs }: { todo: TodoItem; delayMs: number }) {
  const status = todo.status
  return (
    <li className="flex items-start gap-3">
      <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center">
        <StatusIcon status={status} delayMs={delayMs} />
      </span>
      <span
        className={`text-[14px] leading-[1.5] transition-colors duration-300 ${
          status === 'in_progress'
            ? 'font-medium text-[var(--ink)]'
            : status === 'completed'
              ? 'text-[var(--ink-muted)]'
              : 'text-[var(--ink-faint)]'
        }`}
        style={{ transitionDelay: `${delayMs}ms` }}
      >
        {todo.content}
      </span>
    </li>
  )
}

// Three states, three shapes — a filled tick, a ring with a travelling arc,
// and an empty ring — so the state reads without relying on colour alone.
function StatusIcon({ status, delayMs }: { status: TodoItem['status']; delayMs: number }) {
  if (status === 'completed') {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--teal)] text-[var(--paper)] transition-colors duration-300"
        style={{ transitionDelay: `${delayMs}ms` }}
      >
        <Check size={10} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--teal)]" aria-label="In progress">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
        <path
          d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ transformOrigin: '8px 8px', animation: 'omni-spin 0.9s linear infinite' }}
        />
      </svg>
    )
  }
  return <span className="h-4 w-4 rounded-full border-[1.5px] border-[var(--ink-fainter)]" aria-label="Pending" />
}

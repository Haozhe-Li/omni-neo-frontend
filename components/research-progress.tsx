'use client'

import { Check, MoreHorizontal, Circle, ClipboardList, Sparkles } from 'lucide-react'
import type { TodoItem } from '@/lib/types'

interface ResearchProgressProps {
  todos: TodoItem[]
  isComplete?: boolean
}

export function ResearchProgress({ todos, isComplete }: ResearchProgressProps) {
  // Empty state
  if (todos.length === 0) {
    if (isComplete) {
      return (
        <div className="animate-fade-up text-center py-8">
          <p className="text-sm text-[var(--muted-foreground)]">No research tasks recorded.</p>
        </div>
      )
    }
    // Still streaming — show minimal skeleton
    return (
      <div className="animate-fade-up py-2 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[var(--border-subtle)] animate-pulse" />
            <div className="h-2 rounded-full bg-[var(--border-subtle)]/50 animate-pulse" style={{ width: `${60 - i * 15}%` }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-2">
        {todos.map((todo, idx) => (
          <TodoItemRow key={idx} todo={todo} />
        ))}
      </div>
    </div>
  )
}

function TodoItemRow({ todo }: { todo: TodoItem }) {
  const isCompleted = todo.status === 'completed'
  const isInProgress = todo.status === 'in_progress'

  return (
    <div className={`
            group flex items-start gap-3 p-2 rounded-lg transition-all duration-200
            ${isInProgress ? 'bg-[var(--secondary)]/50' : 'hover:bg-[var(--secondary)]/30'}
        `}>
      <div className={`mt-0.5 flex-shrink-0 transition-colors duration-300 ${isInProgress ? 'text-[var(--accent)]' : (isCompleted ? 'text-[var(--muted-foreground)]' : 'text-[var(--border)]')}`}>
        <StatusIcon status={todo.status} />
      </div>
      <span className={`text-sm leading-relaxed transition-colors duration-300 ${isCompleted ? 'text-[var(--muted-foreground)] line-through opacity-80' : 'text-[var(--foreground)]'}`}>
        {todo.content}
      </span>
    </div>
  )
}

function StatusIcon({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'completed':
      return <Check className="h-4 w-4" />
    case 'in_progress':
      return <MoreHorizontal className="h-4 w-4 animate-pulse" />
    case 'pending':
      return <Circle className="h-4 w-4" />
    default:
      return <Circle className="h-4 w-4" />
  }
}



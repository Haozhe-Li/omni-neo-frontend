'use client'

import { Check, MoreHorizontal, Circle, ClipboardList, Sparkles } from 'lucide-react'
import type { TodoItem } from '@/lib/types'

interface ResearchProgressProps {
  todos: TodoItem[]
  isComplete?: boolean
}

export function ResearchProgress({ todos, isComplete }: ResearchProgressProps) {
  const completedCount = todos.filter((t) => t.status === 'completed').length

  // Empty state
  if (todos.length === 0) {
    if (isComplete) {
      // Answer arrived with no research progress — show empty state
      return (
        <div className="animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Omni's Notebook</h3>
            <span className="text-xs text-muted-foreground">— No research tasks</span>
          </div>
        </div>
      )
    }
    // Still streaming — show skeleton loader
    return (
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-medium text-foreground">Omni's Notebook</h3>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3">
          <Sparkles className="h-4 w-4 text-muted-foreground animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">Building research plan...</p>
            <div className="h-1 rounded-full bg-border overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-muted-foreground/30 animate-shimmer-bar" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      {/* Header row with icon and progress bar */}
      <div className="flex items-center gap-3 mb-0">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-muted-foreground flex-shrink-0">
          <ClipboardList className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-medium text-foreground flex-shrink-0">
          Omni's Notebook
        </h3>
        <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-accent/60 transition-all duration-500 ease-out"
            style={{
              width: `${todos.length > 0 ? (completedCount / todos.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
          {completedCount}/{todos.length}
        </span>
      </div>

      {/* Compact horizontal todo chips */}
      <div className="flex flex-wrap gap-2 mt-3">
        {todos.map((todo, idx) => (
          <TodoChip key={idx} todo={todo} />
        ))}
      </div>
    </div>
  )
}

function TodoChip({ todo }: { todo: TodoItem }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-all duration-300 ${todo.status === 'completed'
        ? 'bg-muted text-muted-foreground'
        : todo.status === 'in_progress'
          ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
          : 'bg-secondary/50 text-muted-foreground/40'
        }`}
    >
      <StatusDot status={todo.status} />
      <span className={todo.status === 'completed' ? 'line-through opacity-70' : ''}>
        {todo.content}
      </span>
    </div>
  )
}

function StatusDot({ status }: { status: TodoItem['status'] }) {
  switch (status) {
    case 'completed':
      return (
        <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-muted-foreground/20">
          <Check className="h-2.5 w-2.5 text-muted-foreground" />
        </div>
      )
    case 'in_progress':
      return (
        <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border border-accent/50">
          <MoreHorizontal className="h-2.5 w-2.5 text-accent animate-pulse" />
        </div>
      )
    case 'pending':
      return (
        <div className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
          <Circle className="h-3 w-3 text-muted-foreground/30" />
        </div>
      )
    default:
      return null
  }
}

'use client'

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import type { QuestionBlock as QuestionBlockType } from '@/lib/types'
import { formatQuestionAnswer } from '@/lib/question-parser'

interface QuestionBlockProps {
  question: QuestionBlockType
  onSubmit: (answer: string) => void
  answered?: boolean
  answeredText?: string
}

const TYPE_LABEL: Record<QuestionBlockType['type'], string> = {
  single: 'Choose one',
  multiple: 'Choose all that apply',
  text: 'Free response',
}

// A → grey badge, selected → accent filled
function OptionBadge({ id, selected }: { id: string; selected: boolean }) {
  return (
    <span
      className={`
        flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-md
        text-[11px] font-semibold tracking-wide transition-colors duration-150
        ${selected
          ? 'bg-accent text-white'
          : 'bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-muted-foreground'
        }
      `}
    >
      {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : id}
    </span>
  )
}

export function QuestionBlock({ question, onSubmit, answered = false, answeredText }: QuestionBlockProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(answered)
  const [submittedAnswer, setSubmittedAnswer] = useState(answeredText ?? '')

  const canSubmit = () => {
    if (submitted) return false
    if (question.type === 'text') return freeText.trim().length > 0
    if (selectedIds.length === 0) return false
    for (const id of selectedIds) {
      const opt = question.options.find((o) => o.id === id)
      if (opt?.has_text_input && !textInputs[id]?.trim()) return false
    }
    return true
  }

  const handleToggle = (id: string) => {
    if (question.type === 'single') {
      setSelectedIds((prev) => (prev[0] === id ? [] : [id]))
    } else {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      )
    }
  }

  const handleSubmit = () => {
    if (!canSubmit()) return
    const answer = formatQuestionAnswer(question, selectedIds, textInputs, freeText)
    if (!answer) return
    setSubmitted(true)
    setSubmittedAnswer(answer)
    onSubmit(answer)
  }

  // ── Answered / read-only ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="mt-3 w-full flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12">
          <Check className="h-3 w-3 text-accent" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] text-muted-foreground/70 mb-0.5 leading-none">{question.prompt}</p>
          <p className="text-[14px] text-foreground leading-snug">{submittedAnswer}</p>
        </div>
      </div>
    )
  }

  // ── Interactive form ──────────────────────────────────────────────────────
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-border/50">
        <p className="text-[15px] font-medium text-foreground leading-snug">{question.prompt}</p>
        <p className="mt-1 text-[12px] text-muted-foreground/60">{TYPE_LABEL[question.type]}</p>
      </div>

      {/* Body */}
      <div className="px-5 py-3 flex flex-col gap-1.5">

        {/* Pure text input */}
        {question.type === 'text' && (
          <textarea
            rows={2}
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder={question.text_placeholder ?? 'Type your answer…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/60 transition-shadow leading-relaxed custom-scrollbar"
          />
        )}

        {/* Option list */}
        {(question.type === 'single' || question.type === 'multiple') &&
          question.options.map((opt) => {
            const isSelected = selectedIds.includes(opt.id)
            return (
              <div key={opt.id}>
                <button
                  type="button"
                  onClick={() => handleToggle(opt.id)}
                  className={`
                    w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-[14px]
                    transition-all duration-150 border
                    ${isSelected
                      ? 'border-accent/30 bg-accent/6 text-foreground'
                      : 'border-transparent bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]'
                    }
                  `}
                >
                  <OptionBadge id={opt.id} selected={isSelected} />
                  <span className="leading-snug flex-1">{opt.label}</span>
                </button>

                {/* Expandable free-text for "Other" options */}
                {opt.has_text_input && isSelected && (
                  <div className="mt-1.5 pl-[calc(22px+12px)]">
                    <input
                      type="text"
                      value={textInputs[opt.id] ?? ''}
                      onChange={(e) =>
                        setTextInputs((prev) => ({ ...prev, [opt.id]: e.target.value }))
                      }
                      placeholder={question.text_placeholder ?? 'Please specify…'}
                      autoFocus
                      className="w-full rounded-lg border border-accent/25 bg-background px-3.5 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
                    />
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-1 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className={`
            flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium
            transition-all duration-150
            ${canSubmit()
              ? 'bg-accent text-white hover:opacity-90 cursor-pointer shadow-sm'
              : 'bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-muted-foreground cursor-not-allowed'
            }
          `}
        >
          Submit
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

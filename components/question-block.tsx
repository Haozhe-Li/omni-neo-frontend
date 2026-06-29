'use client'

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import type { QuestionBlock as QuestionBlockType, QuestionItem } from '@/lib/types'
import { formatQuestionAnswer } from '@/lib/question-parser'

interface QuestionBlockProps {
  question: QuestionBlockType
  onSubmit: (answer: string) => void
  answered?: boolean
  answeredText?: string
}

type AnswerState = {
  selectedIds: string[]
  textInputs: Record<string, string>
  freeText: string
}

const TYPE_LABEL: Record<QuestionItem['type'], string> = {
  single: 'Choose one',
  multiple: 'Choose all that apply',
  text: 'Free response',
}

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

function SingleQuestion({
  q,
  answer,
  onChange,
  isLast,
}: {
  q: QuestionItem
  answer: AnswerState
  onChange: (updated: AnswerState) => void
  isLast: boolean
}) {
  const handleToggle = (id: string) => {
    if (q.type === 'single') {
      onChange({ ...answer, selectedIds: answer.selectedIds[0] === id ? [] : [id] })
    } else {
      const next = answer.selectedIds.includes(id)
        ? answer.selectedIds.filter((x) => x !== id)
        : [...answer.selectedIds, id]
      onChange({ ...answer, selectedIds: next })
    }
  }

  return (
    <div className={!isLast ? 'border-b border-border/50' : ''}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border/40">
        <p className="text-[15px] font-medium text-foreground leading-snug">{q.prompt}</p>
        <p className="mt-1 text-[12px] text-muted-foreground/60">{TYPE_LABEL[q.type]}</p>
      </div>

      {/* Body */}
      <div className="px-5 py-3 flex flex-col gap-1.5">
        {q.type === 'text' && (
          <textarea
            rows={2}
            value={answer.freeText}
            onChange={(e) => onChange({ ...answer, freeText: e.target.value })}
            placeholder={q.text_placeholder ?? 'Type your answer…'}
            className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/60 transition-shadow leading-relaxed custom-scrollbar"
          />
        )}

        {(q.type === 'single' || q.type === 'multiple') &&
          q.options.map((opt) => {
            const isSelected = answer.selectedIds.includes(opt.id)
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

                {opt.has_text_input && isSelected && (
                  <div className="mt-1.5 pl-[calc(22px+12px)]">
                    <input
                      type="text"
                      value={answer.textInputs[opt.id] ?? ''}
                      onChange={(e) =>
                        onChange({
                          ...answer,
                          textInputs: { ...answer.textInputs, [opt.id]: e.target.value },
                        })
                      }
                      placeholder={q.text_placeholder ?? 'Please specify…'}
                      autoFocus
                      className="w-full rounded-lg border border-accent/25 bg-background px-3.5 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-shadow"
                    />
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

export function QuestionSkeleton() {
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)] animate-pulse">
      <div className="px-5 pt-5 pb-4 border-b border-border/40">
        <div className="h-[15px] w-3/4 rounded-md bg-foreground/[0.07]" />
        <div className="h-[11px] w-1/5 rounded-md bg-foreground/[0.04] mt-2" />
      </div>
      <div className="px-5 py-3 flex flex-col gap-2">
        {[72, 55, 64].map((w, i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-foreground/[0.04]"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
      <div className="px-5 pb-4 pt-2 flex justify-end border-t border-border/50">
        <div className="h-8 w-24 rounded-lg bg-foreground/[0.06]" />
      </div>
    </div>
  )
}

export function QuestionBlock({ question, onSubmit, answered = false, answeredText }: QuestionBlockProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    Object.fromEntries(
      question.questions.map((q) => [q.id, { selectedIds: [], textInputs: {}, freeText: '' }])
    )
  )
  const [submitted, setSubmitted] = useState(answered)
  const [submittedAnswer, setSubmittedAnswer] = useState(answeredText ?? '')

  const getAnswer = (id: string): AnswerState =>
    answers[id] ?? { selectedIds: [], textInputs: {}, freeText: '' }

  const setAnswer = (id: string, updated: AnswerState) =>
    setAnswers((prev) => ({ ...prev, [id]: updated }))

  const isQuestionComplete = (q: QuestionItem): boolean => {
    const a = getAnswer(q.id)
    if (q.type === 'text') return a.freeText.trim().length > 0
    if (a.selectedIds.length === 0) return false
    for (const id of a.selectedIds) {
      const opt = q.options.find((o) => o.id === id)
      if (opt?.has_text_input && !a.textInputs[id]?.trim()) return false
    }
    return true
  }

  const canSubmit = () => !submitted && question.questions.every(isQuestionComplete)

  const handleSubmit = () => {
    if (!canSubmit()) return
    const parts = question.questions.map((q, i) => {
      const a = getAnswer(q.id)
      const answer = formatQuestionAnswer(q, a.selectedIds, a.textInputs, a.freeText)
      return `${i + 1}. ${q.prompt}\n${answer}`
    })
    const formatted = parts.join('\n\n')
    setSubmitted(true)
    setSubmittedAnswer(formatted)
    onSubmit(formatted)
  }

  // ── Answered / read-only ──────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="mt-3 w-full flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/12">
          <Check className="h-3 w-3 text-accent" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted-foreground/70 mb-1.5 leading-none">
            {question.questions.length === 1
              ? question.questions[0].prompt
              : `${question.questions.length} questions answered`}
          </p>
          <p className="text-[14px] text-foreground leading-snug whitespace-pre-wrap">{submittedAnswer}</p>
        </div>
      </div>
    )
  }

  // ── Interactive form ──────────────────────────────────────────────────────
  return (
    <div className="mt-3 w-full rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {question.questions.map((q, idx) => (
        <SingleQuestion
          key={q.id}
          q={q}
          answer={getAnswer(q.id)}
          onChange={(updated) => setAnswer(q.id, updated)}
          isLast={idx === question.questions.length - 1}
        />
      ))}

      {/* Footer */}
      <div className="px-5 pb-4 pt-2.5 flex items-center justify-between border-t border-border/50">
        {question.questions.length > 1 ? (
          <span className="text-[11.5px] text-muted-foreground/50 tabular-nums">
            {question.questions.filter((q) => isQuestionComplete(q)).length}
            {' / '}
            {question.questions.length} answered
          </span>
        ) : (
          <span />
        )}
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
          {question.questions.length > 1 ? 'Submit all' : 'Submit'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

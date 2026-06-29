import type { QuestionBlock, QuestionItem } from './types'

const QUESTION_RE = /<question>([\s\S]*?)<\/question>/i

export interface ParsedQuestion {
  /** Message text with the <question> block stripped out. */
  text: string
  question: QuestionBlock | null
  /** True when <question> tag has opened but </question> hasn't arrived yet (mid-stream). */
  questionPending: boolean
}

/**
 * Extract a `<question>…</question>` block from `content`.
 * Returns the block as a parsed object and the remaining text without it.
 * If the block is absent or malformed JSON, `question` is null and `text`
 * is the original content unchanged.
 */
export function parseQuestion(content: string): ParsedQuestion {
  const match = QUESTION_RE.exec(content)
  if (!match) {
    // The block may be mid-stream (opening tag present, closing tag not yet
    // arrived). Strip everything from <question> onward so the raw tag never
    // leaks into the markdown renderer.
    const openIdx = content.search(/<question>/i)
    if (openIdx !== -1) {
      return { text: content.slice(0, openIdx).trimEnd(), question: null, questionPending: true }
    }
    return { text: content, question: null, questionPending: false }
  }

  const before = content.slice(0, match.index).trimEnd()
  const after = content.slice(match.index + match[0].length).trimStart()
  const text = [before, after].filter(Boolean).join('\n\n')

  try {
    const raw = JSON.parse(match[1].trim())
    if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
      return { text: content, question: null, questionPending: false }
    }
    const block: QuestionBlock = {
      questions: raw.questions.map((q: any) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
      })),
    }
    return { text, question: block, questionPending: false }
  } catch {
    // Invalid JSON — leave text intact so the raw block is still readable.
    return { text: content, question: null, questionPending: false }
  }
}

/**
 * Format the user's answer to a single question item into a natural-language
 * string. Called once per question when building the full submission.
 */
export function formatQuestionAnswer(
  question: QuestionItem,
  selectedIds: string[],
  textInputs: Record<string, string>,
  freeText: string,
): string {
  if (question.type === 'text') {
    return freeText.trim()
  }

  const parts: string[] = []
  for (const id of selectedIds) {
    const opt = question.options.find((o) => o.id === id)
    if (!opt) continue
    if (opt.has_text_input && textInputs[id]?.trim()) {
      parts.push(`${opt.label}: ${textInputs[id].trim()}`)
    } else {
      parts.push(opt.label)
    }
  }

  if (parts.length === 0) return ''
  return parts.length === 1 ? parts[0] : parts.join(', ')
}

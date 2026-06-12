import type { QuestionBlock } from './types'

const QUESTION_RE = /<question>([\s\S]*?)<\/question>/i

export interface ParsedQuestion {
  /** Message text with the <question> block stripped out. */
  text: string
  question: QuestionBlock | null
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
      return { text: content.slice(0, openIdx).trimEnd(), question: null }
    }
    return { text: content, question: null }
  }

  const before = content.slice(0, match.index).trimEnd()
  const after = content.slice(match.index + match[0].length).trimStart()
  const text = [before, after].filter(Boolean).join('\n\n')

  try {
    const question = JSON.parse(match[1].trim()) as QuestionBlock
    // Normalise: ensure options is always an array.
    if (!Array.isArray(question.options)) question.options = []
    return { text, question }
  } catch {
    // Invalid JSON — leave text intact so the raw block is still readable.
    return { text: content, question: null }
  }
}

/**
 * Format the user's answers into a natural-language reply string that will be
 * sent back to the agent as the next user message.
 */
export function formatQuestionAnswer(
  question: QuestionBlock,
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

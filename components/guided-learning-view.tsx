'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { ArrowUp, Copy, Check, ThumbsUp, ThumbsDown, Menu, X, Loader2, MoreHorizontal, FileText, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react'
import { FinalAnswer } from '@/components/final-answer'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'
import { TextSelectionMenu } from '@/components/text-selection-menu'
import { Mermaid } from '@/components/mermaid'
import { getUserLocation } from '@/lib/location'
import { getAiRequestErrorMessage, getLocalISOString } from '@/lib/utils'
import { preprocessMarkdown } from '@/lib/markdown'
import { appendQueryToMemoryQueue, getMemories } from '@/lib/memories'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { useApi } from '@/hooks/useApi'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'

// ── Interfaces ──────────────────────────────────────────────────────────────

interface GuidedLearningViewProps {
    query: string
    threadId: string
    onNewSearch: () => void
    onToggleSidebar?: () => void
    isMobile?: boolean
    initialAttachedFileIds?: string[]
    initialAttachedFileMeta?: { id: string; name: string; type: string }[]
}

interface QuizQuestion {
    question: string
    options: string[]
    answer: number // 0-indexed correct answer
}

interface Flashcard {
    key: string
    value: string
}

interface GuidedSource {
    title: string
    url: string
}

interface ToolStep {
    type: 'tool_call'
    tool: string
    args: any
    timestamp: number
}

interface GuidedMessage {
    role: 'user' | 'assistant'
    content: string
    mode?: 'guided_learning'
    follow_up_content?: string
    attachedFiles?: { id: string; name: string; type: string }[]
    sources?: GuidedSource[]
    steps?: ToolStep[]
    questions_for_user?: QuizQuestion[]
    quiz_user_answers?: number[]
    quiz_graded?: boolean
    flashcard?: Flashcard[]
    note?: string
    is_quiz_submission?: boolean
}

// ── Helper functions ────────────────────────────────────────────────────────

function getStepLabel(step: ToolStep) {
    if (step.tool === 'google_search_light') return `Searching for "${step.args?.query || '...'}"`
    if (step.tool === 'load_web_page_light') return `Visiting web page "${step.args?.url || '...'}"`
    if (step.tool === 'read_user_document') return `Reading attached files...`
    if (step.tool === 'python_code_sandbox_light') return `Running Python code...`
    if (step.tool === 'arxiv_search_light') return `Searching arXiv for "${step.args?.query || '...'}"`
    return `Using ${step.tool}`
}

function normalizeSources(raw: unknown): GuidedSource[] {
    if (!Array.isArray(raw)) return []
    return raw.reduce<GuidedSource[]>((acc, item) => {
        if (!item || typeof item !== 'object') return acc
        const s = item as Record<string, unknown>
        const title = typeof s.title === 'string' ? s.title.trim() : ''
        const url = typeof s.url === 'string' ? s.url.trim() : ''
        if (!title || !url) return acc
        acc.push({ title, url })
        return acc
    }, [])
}

function getSourceDomain(url: string) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'source' }
}

function extractNodeText(node: ReactNode): string {
    if (node == null) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(extractNodeText).join('')
    if (typeof node === 'object' && 'props' in node) {
        return extractNodeText((node as { props?: { children?: ReactNode } }).props?.children)
    }
    return ''
}

const isUntitledTitle = (value?: string) => {
    const n = (value || '').trim().toLowerCase()
    return !n || n === 'untitled' || n === 'untitled chat'
}

const inferTitleFromMessages = (messages: GuidedMessage[], fallback: string) => {
    const first = messages.find(m => m.role === 'user' && m.content?.trim())
    return first?.content?.trim() || fallback
}

// ── Markdown components ─────────────────────────────────────────────────────

function CodeCopyButton({ getText }: { getText: () => string }) {
    const [copied, setCopied] = useState(false)
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(getText().trim())
            setCopied(true)
            toast.success('Code copied')
            setTimeout(() => setCopied(false), 1600)
        } catch { toast.error('Failed to copy') }
    }
    return (
        <button onClick={handleCopy} className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-background/80 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer" title="Copy code">
            {copied ? <><Check className="h-3 w-3" /><span>Copied</span></> : <><Copy className="h-3 w-3" /><span>Copy</span></>}
        </button>
    )
}

/* ── Chat markdown (simpler, for inline messages) ── */
const chatMarkdownComponents: Components = {
    pre: ({ children }: any) => {
        if (children?.props?.className?.includes('language-mermaid')) return <>{children}</>
        return (<div className="relative group my-4"><pre>{children}</pre><CodeCopyButton getText={() => extractNodeText(children)} /></div>)
    },
    code: ({ className, children, ...props }) => {
        if (className?.includes('language-mermaid')) return <Mermaid chart={String(children).replace(/\n$/, '')} />
        if (!className) return <code className="rounded-md border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[0.9em] text-foreground" {...props}>{children}</code>
        return <code className={className} {...props}>{children}</code>
    },
    a: ({ className, ...props }) => <a {...props} className={[className, 'text-[var(--accent)] hover:underline underline-offset-2 decoration-[0.08em] transition-colors'].filter(Boolean).join(' ')} />,
    strong: ({ children }) => <span className="font-semibold">{children}</span>,
    h1: ({ children }) => <span className="block text-xl font-semibold my-4">{children}</span>,
    h2: ({ children }) => <span className="block text-lg font-semibold my-3">{children}</span>,
    h3: ({ children }) => <span className="block text-md font-semibold my-2">{children}</span>,
    table: ({ children }) => (<div className="w-full overflow-x-auto my-4 rounded-xl border border-[var(--border-subtle)]/60 bg-[var(--background)]"><table className="w-full text-sm text-left border-collapse">{children}</table></div>),
    thead: ({ children }) => <thead className="bg-[var(--secondary)]/30 text-[var(--muted-foreground)] text-xs uppercase tracking-wider">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-[var(--border-subtle)]/40">{children}</tbody>,
    tr: ({ children }) => <tr className="hover:bg-[var(--secondary)]/20 transition-colors">{children}</tr>,
    th: ({ children }) => <th className="px-4 py-3 font-medium whitespace-nowrap">{children}</th>,
    td: ({ children }) => <td className="px-4 py-3 text-[var(--foreground)]">{children}</td>,
}

// ── Quiz Block Sub-component ────────────────────────────────────────────────

function QuizBlock({ questions, userAnswers, graded, onSubmit }: {
    questions: QuizQuestion[]
    userAnswers?: number[]
    graded?: boolean
    onSubmit: (answers: number[]) => void
}) {
    const [selections, setSelections] = useState<(number | null)[]>(
        userAnswers ?? new Array(questions.length).fill(null)
    )

    const handleSelect = (qIdx: number, optIdx: number) => {
        if (graded) return
        setSelections(prev => { const c = [...prev]; c[qIdx] = optIdx; return c })
    }

    const allAnswered = selections.every(s => s !== null)
    const correctCount = graded ? questions.reduce((acc, q, i) => acc + (selections[i] === q.answer ? 1 : 0), 0) : 0
    const percentage = graded ? Math.round((correctCount / questions.length) * 100) : 0

    return (
        <div className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--background)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border-subtle)]/50">
                <span className="text-sm font-medium text-[var(--foreground)]">Quiz</span>
                <span className="text-xs text-[var(--muted-foreground)]">· {questions.length} questions</span>
            </div>

            <div className="p-5 space-y-6">
                {questions.map((q, qIdx) => (
                    <div key={qIdx} className="space-y-3">
                        <div className="flex items-start gap-2">
                            <span className="text-xs font-medium text-[var(--muted-foreground)] bg-[var(--secondary)]/60 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">{qIdx + 1}</span>
                            <div className="text-[15px] text-[var(--foreground)] leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                            {q.options.map((opt, oIdx) => {
                                const selected = selections[qIdx] === oIdx
                                const isCorrectOpt = graded && oIdx === q.answer
                                const isWrongSelected = graded && selected && oIdx !== q.answer
                                let optClass = 'border-[var(--border-subtle)] hover:border-[var(--foreground)]/30'
                                if (!graded && selected) optClass = 'border-[var(--foreground)]/50 bg-[var(--secondary)]/40'
                                if (graded && isCorrectOpt) optClass = 'border-[var(--accent)]/50 bg-[var(--accent)]/8'
                                if (isWrongSelected) optClass = 'border-[var(--foreground)]/15 bg-[var(--secondary)]/10 opacity-50'

                                return (
                                    <button key={oIdx} onClick={() => handleSelect(qIdx, oIdx)} disabled={graded}
                                        className={`relative text-left px-4 py-3 rounded-lg border text-sm transition-all duration-200 ${optClass} ${graded ? 'cursor-default' : 'cursor-pointer'}`}>
                                        <div className="flex items-center gap-2">
                                            {graded && isCorrectOpt && <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" strokeWidth={2.5} />}
                                            {isWrongSelected && <X className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" strokeWidth={2.5} />}
                                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <span>{children}</span> }}>{opt}</ReactMarkdown>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Report or Submit */}
            <div className="px-5 pb-5">
                {graded ? (
                    <div className="rounded-lg p-4 border border-[var(--border-subtle)] bg-[var(--secondary)]/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-[var(--foreground)]">Results</p>
                                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{correctCount} / {questions.length} correct</p>
                            </div>
                            <div className="text-2xl font-semibold text-[var(--foreground)]">{percentage}%</div>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--accent)]/60 transition-all duration-700" style={{ width: `${percentage}%` }} />
                        </div>
                    </div>
                ) : (
                    <button onClick={() => { if (allAnswered) onSubmit(selections as number[]) }} disabled={!allAnswered}
                        className={`w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${allAnswered ? 'bg-[var(--foreground)] text-[var(--background)] hover:opacity-90' : 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'}`}>
                        Submit Answers
                    </button>
                )}
            </div>
        </div>
    )
}

// ── Flashcard Block Sub-component ───────────────────────────────────────────

function FlashcardBlock({ cards }: { cards: Flashcard[] }) {
    const [current, setCurrent] = useState(0)
    const [flipped, setFlipped] = useState(false)

    const next = () => { setFlipped(false); setTimeout(() => setCurrent(prev => Math.min(prev + 1, cards.length - 1)), 150) }
    const prev = () => { setFlipped(false); setTimeout(() => setCurrent(prev => Math.max(prev - 1, 0)), 150) }

    if (cards.length === 0) return null
    const card = cards[current]

    return (
        <div className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--background)] overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border-subtle)]/50">
                <span className="text-sm font-medium text-[var(--foreground)]">Flashcards</span>
                <span className="text-xs text-[var(--muted-foreground)]">· {cards.length} cards</span>
            </div>

            <div className="p-5">
                {/* Card with 3D flip */}
                <div className="relative w-full" style={{ perspective: '1000px' }}>
                    <div onClick={() => setFlipped(!flipped)} className="cursor-pointer w-full transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        {/* Front */}
                        <div className="w-full min-h-[200px] rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 flex flex-col items-center justify-center p-8 text-center" style={{ backfaceVisibility: 'hidden' }}>
                            <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest mb-3 font-medium">Term</p>
                            <p className="text-lg font-medium text-[var(--foreground)] leading-relaxed">{card.key}</p>
                            <p className="text-[11px] text-[var(--muted-foreground)]/60 mt-4">Click to flip</p>
                        </div>
                        {/* Back */}
                        <div className="w-full min-h-[200px] rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/10 flex flex-col items-center justify-center p-8 text-center absolute top-0 left-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-widest mb-3 font-medium">Definition</p>
                            <div className="text-[15px] text-[var(--foreground)] leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{card.value}</ReactMarkdown>
                            </div>
                            <p className="text-[11px] text-[var(--muted-foreground)]/60 mt-4">Click to flip back</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between mt-4">
                    <button onClick={prev} disabled={current === 0}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${current === 0 ? 'text-[var(--muted-foreground)]/40 cursor-not-allowed' : 'text-[var(--foreground)] hover:bg-[var(--secondary)]'}`}>
                        <ChevronLeft className="h-4 w-4" /> Prev
                    </button>
                    <span className="text-xs text-[var(--muted-foreground)]">{current + 1} / {cards.length}</span>
                    <button onClick={next} disabled={current === cards.length - 1}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${current === cards.length - 1 ? 'text-[var(--muted-foreground)]/40 cursor-not-allowed' : 'text-[var(--foreground)] hover:bg-[var(--secondary)]'}`}>
                        Next <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

// NotePanel is now replaced by FinalAnswer — no custom component needed

// ── Module-level sets for title dedup ────────────────────────────────────────
const fetchedTitleThreadSet = new Set<string>()
const inFlightTitleThreadSet = new Set<string>()

// ── Main Component ──────────────────────────────────────────────────────────

export function GuidedLearningView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false, initialAttachedFileIds, initialAttachedFileMeta }: GuidedLearningViewProps) {
    const { attachedFiles, setAttachedFiles, uploadFile, removeFile, clearFiles } = useFileUpload()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const initialFilesSentRef = useRef(false)
    const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
    const { isSignedIn } = useAuth()
    const clerk = useClerk()

    const [messages, setMessages] = useState<GuidedMessage[]>([
        { role: 'user', content: query },
        { role: 'assistant', content: '...' }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [followUpText, setFollowUpText] = useState('')
    const [title, setTitle] = useState(query)
    const [noteOpen, setNoteOpen] = useState(false)
    const [activeNoteContent, setActiveNoteContent] = useState('')
    const [isFading, setIsFading] = useState(false)

    const lastAutoScrolledAssistantKeyRef = useRef<string>('')
    const containerRef = useRef<HTMLDivElement>(null)
    const chatScrollRef = useRef<HTMLDivElement>(null)
    const isInitializedRef = useRef(false)

    const { fetchWithAuth } = useApi()

    // Pre-populate file chips
    useEffect(() => {
        if (initialAttachedFileMeta && initialAttachedFileMeta.length > 0) {
            setAttachedFiles(initialAttachedFileMeta.map(f => ({
                id: f.id, file: new File([], f.name), name: f.name, size: 0, type: f.type, status: 'ready' as const, progress: 100
            })))
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Backend sync ──────────────────────────────────────────────────────────
    const syncToBackend = useCallback((msgs: GuidedMessage[], syncTitle?: string) => {
        if (!threadId || isMockMode) return
        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        const payloadMessages = msgs.map((m, i) => i === 0 ? { ...m, mode: 'guided_learning' } : m)
        const body: Record<string, unknown> = { messages: payloadMessages }
        if (syncTitle && !isUntitledTitle(syncTitle)) body.title = syncTitle
        fetchWithAuth(`${backendUrl}/api/threads/${threadId}/sync`, {
            method: 'POST', body: JSON.stringify(body),
        }).catch(() => { })
    }, [threadId, fetchWithAuth, isMockMode])

    // ── Auto scroll ───────────────────────────────────────────────────────────
    useEffect(() => {
        let lastIdx = -1
        for (let i = messages.length - 1; i >= 0; i--) { if (messages[i]?.role === 'assistant') { lastIdx = i; break } }
        if (lastIdx < 0) return
        const phase = messages[lastIdx]?.content === '...' ? 'placeholder' : 'final'
        const key = `${lastIdx}:${phase}`
        if (key === lastAutoScrolledAssistantKeyRef.current) return
        lastAutoScrolledAssistantKeyRef.current = key
        requestAnimationFrame(() => {
            const userIdx = lastIdx - 1
            const target = containerRef.current?.querySelector(`[data-message-index="${userIdx >= 0 ? userIdx : lastIdx}"]`) as HTMLElement | null
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
    }, [messages])

    // ── Stream handler ────────────────────────────────────────────────────────
    const handleStreamResponse = useCallback(async (response: Response, initialHistory: GuidedMessage[]) => {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) throw new Error('Failed to get stream reader')

        let buffer = ''
        let currentSteps: ToolStep[] = []

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data: ')) continue
                try {
                    const data = JSON.parse(trimmed.slice(6))
                    if (data.type === 'tool_call') {
                        const newStep: ToolStep = { type: 'tool_call', tool: data.tool, args: data.args, timestamp: Date.now() }
                        currentSteps = [...currentSteps, newStep]
                        setMessages(prev => {
                            const copy = [...prev]
                            const last = copy[copy.length - 1]
                            if (last?.role === 'assistant') copy[copy.length - 1] = { ...last, steps: currentSteps }
                            return copy
                        })
                    } else if (data.type === 'answer') {
                        const answer = data.answer || "No answer returned."
                        const sources = normalizeSources(data.sources)
                        const questions_for_user = Array.isArray(data.questions_for_user) && data.questions_for_user.length > 0 ? data.questions_for_user : undefined
                        const flashcard = Array.isArray(data.flashcard) && data.flashcard.length > 0 ? data.flashcard : undefined
                        const note = typeof data.note === 'string' && data.note.trim() ? data.note : undefined

                        const assistantMsg: GuidedMessage = {
                            role: 'assistant', content: answer, sources, steps: currentSteps,
                            questions_for_user, flashcard, note,
                        }
                        const finalMessages = [...initialHistory, assistantMsg]
                        setMessages(finalMessages)

                        // Auto-open note panel if note is present
                        if (note) { setActiveNoteContent(note); setNoteOpen(true) }

                        if (threadId) {
                            const historyData = {
                                thread_id: threadId, query: initialHistory[0].content, type: 'guided_learning',
                                chat_history: finalMessages, timestamp: Date.now(), title: title || initialHistory[0].content
                            }
                            localStorage.setItem(threadId, JSON.stringify(historyData))
                            syncToBackend(finalMessages, historyData.title)
                        }
                        setIsLoading(false)
                        return
                    }
                } catch (e) { console.error('Error parsing SSE chunk', e) }
            }
        }
        setIsLoading(false)
    }, [threadId, title, syncToBackend])

    // ── Quiz submit handler ───────────────────────────────────────────────────
    const handleQuizSubmit = useCallback(async (msgIdx: number, answers: number[]) => {
        // 1) Grade locally
        setMessages(prev => {
            const copy = [...prev]
            const msg = copy[msgIdx]
            if (msg?.role === 'assistant' && msg.questions_for_user) {
                copy[msgIdx] = { ...msg, quiz_user_answers: answers, quiz_graded: true }
            }
            return copy
        })

        // 2) Persist grading
        await new Promise(r => setTimeout(r, 50))
        let currentMessages: GuidedMessage[] = []
        setMessages(current => { currentMessages = current; return current })
        if (threadId) {
            const historyData = {
                thread_id: threadId, query, type: 'guided_learning',
                chat_history: currentMessages, timestamp: Date.now(), title: title || query
            }
            localStorage.setItem(threadId, JSON.stringify(historyData))
            syncToBackend(currentMessages, historyData.title)
        }

        // 3) Format answers as JSON and silently send as a hidden user message + new request
        const quizContent = JSON.stringify({ quiz_answers: answers, message_index: msgIdx })
        const hiddenUserMsg: GuidedMessage = {
            role: 'user', content: quizContent, is_quiz_submission: true
        }
        const newHistory = [...currentMessages, hiddenUserMsg]
        setMessages([...newHistory, { role: 'assistant', content: '...' }])
        setIsLoading(true)

        if (threadId) {
            const historyData2 = { thread_id: threadId, query, type: 'guided_learning', chat_history: newHistory, timestamp: Date.now(), title: title || query }
            localStorage.setItem(threadId, JSON.stringify(historyData2))
            syncToBackend(newHistory, historyData2.title)
        }

        // 4) Fire new streaming request
        try {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
            const endpoint = baseUrl.endsWith('/') ? `${baseUrl}guided-learning` : `${baseUrl}/guided_learning`
            const personalization: any = {}
            if (typeof window !== 'undefined') {
                const savedLang = localStorage.getItem('omni_response_language')
                if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
                const savedEnableMemories = localStorage.getItem('omni_enable_memories')
                if (savedEnableMemories === 'true') { const m = getMemories(); if (m) personalization.memories = m }
            }
            const locData = await getUserLocation(false)
            personalization.user_local_datetime = getLocalISOString()
            if (locData?.value) personalization.user_location = locData.value

            const payload: any = { query: quizContent, thread_id: threadId }
            if (Object.keys(personalization).length > 0) payload.personalization = personalization

            const res = await fetchWithAuth(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            })
            if (!res.ok) { const message = getAiRequestErrorMessage(res.status); toast.error(message); throw new Error(message) }
            await handleStreamResponse(res, newHistory)
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'Request failed.'
            setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'assistant', content: errorMessage }; return copy })
            setIsLoading(false)
        }
    }, [threadId, query, title, syncToBackend, fetchWithAuth, handleStreamResponse])

    // ── Init from storage or fresh request ────────────────────────────────────
    useEffect(() => {
        const initChat = async () => {
            // 1) Try backend
            if (!isMockMode && isSignedIn) {
                try {
                    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
                    const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`)
                    if (res.ok) {
                        const data = await res.json()
                        if (Array.isArray(data?.messages) && data.messages.length > 0) {
                            const remote = data.messages as GuidedMessage[]
                            const remoteTitle = typeof data?.title === 'string' ? data.title.trim() : ''
                            const resolved = isUntitledTitle(remoteTitle) ? inferTitleFromMessages(remote, query) : remoteTitle
                            setMessages(remote)
                            setTitle(resolved)
                            if (!isUntitledTitle(resolved)) fetchedTitleThreadSet.add(threadId)
                            setIsLoading(false)
                            // Restore note panel if any message has a note
                            const noteMsg = remote.find(m => m.note && m.note.trim())
                            if (noteMsg?.note) { setActiveNoteContent(noteMsg.note); setNoteOpen(true) }
                            if (typeof window !== 'undefined') {
                                localStorage.setItem(threadId, JSON.stringify({
                                    thread_id: threadId, query, type: 'guided_learning', model: 'guided_learning',
                                    chat_history: remote, timestamp: Date.now(), title: resolved
                                }))
                            }
                            isInitializedRef.current = true
                            return
                        }
                    }
                } catch { }
            }

            // 2) Local storage
            if (typeof window !== 'undefined' && threadId) {
                const stored = localStorage.getItem(threadId)
                if (stored) {
                    try {
                        const data = JSON.parse(stored)
                        if (data.thread_id === threadId && data.type === 'guided_learning' && Array.isArray(data.chat_history)) {
                            setMessages(data.chat_history)
                            if (data.title) { setTitle(data.title); if (!isUntitledTitle(data.title)) fetchedTitleThreadSet.add(threadId) }
                            setIsLoading(false)
                            const noteMsg = data.chat_history.find((m: GuidedMessage) => m.note && m.note.trim())
                            if (noteMsg?.note) { setActiveNoteContent(noteMsg.note); setNoteOpen(true) }
                            isInitializedRef.current = true
                            return
                        }
                    } catch { }
                }
            }

            // 3) Fresh request
            setIsLoading(true)
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
                const endpoint = baseUrl.endsWith('/') ? `${baseUrl}guided_learning` : `${baseUrl}/guided_learning`
                const personalization: any = {}
                if (typeof window !== 'undefined') {
                    const savedLang = localStorage.getItem('omni_response_language')
                    if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
                    const savedEnableMemories = localStorage.getItem('omni_enable_memories')
                    if (savedEnableMemories === 'true') { const m = getMemories(); if (m) personalization.memories = m }
                }
                const locData = await getUserLocation(false)
                personalization.user_local_datetime = getLocalISOString()
                if (locData?.value) personalization.user_location = locData.value

                const payload: any = { query, thread_id: threadId }
                if (initialAttachedFileMeta && initialAttachedFileMeta.length > 0 && !initialFilesSentRef.current) {
                    payload.attached_file_ids = initialAttachedFileMeta.map(m => ({ [m.id]: m.name }))
                    initialFilesSentRef.current = true
                } else if (initialAttachedFileIds && initialAttachedFileIds.length > 0 && !initialFilesSentRef.current) {
                    payload.attached_file_ids = initialAttachedFileIds.map(id => ({ [id]: 'unknown_file' }))
                    initialFilesSentRef.current = true
                }
                if (Object.keys(personalization).length > 0) payload.personalization = personalization

                appendQueryToMemoryQueue(query)
                const res = await fetchWithAuth(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                })
                if (!res.ok) { const message = getAiRequestErrorMessage(res.status); toast.error(message); throw new Error(message) }

                const initialFileMeta = initialAttachedFileMeta && initialAttachedFileMeta.length > 0
                    ? initialAttachedFileMeta : attachedFiles.filter(f => f.status === 'ready').map(f => ({ id: f.id!, name: f.name, type: f.type }))

                await handleStreamResponse(res, [{
                    role: 'user', content: query,
                    ...(initialFileMeta.length > 0 && { attachedFiles: initialFileMeta })
                }])
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
                setMessages(prev => { const copy = [...prev]; copy[1] = { role: 'assistant', content: errorMessage }; return copy })
                setIsLoading(false)
            }
            isInitializedRef.current = true
        }
        initChat()
    }, [threadId, query, fetchWithAuth, isMockMode, isSignedIn, handleStreamResponse, syncToBackend]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Send follow-up ────────────────────────────────────────────────────────
    const handleSend = async () => {
        if (!input.trim() || isLoading) return
        const currentFollowUp = followUpText

        const userMsg: GuidedMessage = {
            role: 'user', content: input, follow_up_content: currentFollowUp || undefined,
        }
        const newHistory = [...messages, userMsg]
        setMessages([...newHistory, { role: 'assistant', content: '...' }])
        setInput('')
        setFollowUpText('')
        setIsLoading(true)

        if (threadId) {
            const historyData = { thread_id: threadId, query, type: 'guided_learning', chat_history: newHistory, timestamp: Date.now(), title: title || query }
            localStorage.setItem(threadId, JSON.stringify(historyData))
            syncToBackend(newHistory, historyData.title)
        }

        try {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
            const endpoint = baseUrl.endsWith('/') ? `${baseUrl}guided-learning` : `${baseUrl}/guided_learning`
            const personalization: any = {}
            if (typeof window !== 'undefined') {
                const savedLang = localStorage.getItem('omni_response_language')
                if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
                const savedEnableMemories = localStorage.getItem('omni_enable_memories')
                if (savedEnableMemories === 'true') { const m = getMemories(); if (m) personalization.memories = m }
            }
            const locData = await getUserLocation(false)
            personalization.user_local_datetime = getLocalISOString()
            if (locData?.value) personalization.user_location = locData.value

            const payload: any = { query: input, thread_id: threadId, ...(currentFollowUp ? { follow_up_content: currentFollowUp } : {}) }
            if (Object.keys(personalization).length > 0) payload.personalization = personalization

            appendQueryToMemoryQueue(input)
            const res = await fetchWithAuth(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            })
            if (!res.ok) { const message = getAiRequestErrorMessage(res.status); toast.error(message); throw new Error(message) }
            await handleStreamResponse(res, newHistory)
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
            setMessages(prev => { const copy = [...prev]; copy[copy.length - 1] = { role: 'assistant', content: errorMessage }; return copy })
            setIsLoading(false)
        }
    }

    const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied to clipboard') }
    const handleFeatureComingSoon = () => toast.info('Feature coming soon')
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (!shouldSubmitOnEnter(e)) return; e.preventDefault(); handleSend() }

    // ── Open/close note split-screen (same pattern as canvas report) ──────────
    const openNote = useCallback((content: string) => {
        setIsFading(true)
        setTimeout(() => {
            setActiveNoteContent(content)
            setNoteOpen(true)
            requestAnimationFrame(() => setIsFading(false))
        }, 250)
    }, [])

    const closeNote = useCallback(() => {
        setIsFading(true)
        setTimeout(() => {
            setNoteOpen(false)
            requestAnimationFrame(() => setIsFading(false))
        }, 250)
    }, [])

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-[var(--background)]" ref={containerRef}>
            <TextSelectionMenu containerRef={containerRef} showCheckSource={false} onFollowUp={(text) => setFollowUpText(text)} allowedSelectors={['[data-selection-scope="assistant-message"]', '[data-selection-scope="note-body"]']} />

            {/* Header */}
            <header className="flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-xl z-30">
                <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 md:px-6 relative">
                    <div className="flex items-center w-24 flex-shrink-0">
                        {isMobile && (
                            <button onClick={onToggleSidebar} className="p-2 -ml-2 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors">
                                <Menu size={20} />
                            </button>
                        )}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 max-w-[50%] sm:max-w-[60%] text-center pointer-events-none">
                        <span className="block text-sm font-medium tracking-tight text-[var(--foreground)]/90 truncate pointer-events-auto">
                            {(() => {
                                let displayTitle = title || query || ''
                                const m = displayTitle.match(/^User want to follow up this pages, please use load webpage tool first to read the page before answering questions: \s*\n(\{[\s\S]*?\})\n\n(?:User Query:\s*)?([\s\S]*)$/)
                                if (m) displayTitle = m[2] || displayTitle
                                return displayTitle
                            })()}
                        </span>
                    </div>
                    <div className="w-24 flex-shrink-0 flex justify-end" />
                </div>
            </header>

            {/* Main split-screen container (same pattern as canvas-view) */}
            <div className="flex-1 overflow-hidden relative">
                <div className={`absolute inset-0 flex transition-opacity duration-250 ease-in-out ${isFading ? 'opacity-0' : 'opacity-100'}`}>

                    {/* ── LEFT: Chat panel ── */}
                    <div className={`${noteOpen && isMobile ? 'hidden' : 'flex'} flex-col min-h-0 bg-[var(--background)] relative transition-all duration-300 ${noteOpen && !isMobile
                        ? 'w-[400px] lg:w-[480px] xl:w-[550px] border-r border-[var(--border-subtle)] shrink-0'
                        : 'flex-1'
                        }`}>

                        {/* Chat scroll */}
                        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            <div className="max-w-2xl mx-auto space-y-8">
                                {messages.map((msg, i) => {
                                    return (
                                        <div key={i} data-message-index={i} data-selection-scope={msg.role === 'assistant' ? 'assistant-message' : undefined}
                                            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`rounded-2xl px-5 py-3 flex flex-col gap-2 ${msg.role === 'user' ? (msg.is_quiz_submission ? 'p-0 bg-transparent w-full max-w-[85%]' : 'max-w-[85%] bg-[var(--secondary)] text-[var(--foreground)]') : 'w-full bg-transparent text-[var(--foreground)]'}`}>
                                                {msg.role === 'assistant' && msg.content === '...' ? (
                                                    <div className="flex flex-col gap-4 w-full py-1 min-w-[240px] sm:min-w-[320px]">
                                                        {msg.steps && msg.steps.length > 0 && (
                                                            <div className="flex flex-col gap-3 mb-1 pl-1">
                                                                {msg.steps.map((step, idx) => {
                                                                    const isLast = idx === msg.steps!.length - 1
                                                                    return (
                                                                        <div key={idx} className="flex items-center gap-3 text-[13px] font-normal text-[var(--muted-foreground)] animate-in fade-in slide-in-from-left-2 duration-500">
                                                                            <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isLast ? '' : 'bg-[var(--foreground)]/5'} mt-0.5`}>
                                                                                {isLast ? <MoreHorizontal className="h-3.5 w-3.5 animate-pulse text-[var(--foreground)]/60" /> : <Check className="h-2.5 w-2.5 text-[var(--muted-foreground)]" strokeWidth={3} />}
                                                                            </div>
                                                                            <span className="opacity-80 font-normal">{getStepLabel(step)}</span>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-3 text-sm font-normal text-[var(--muted-foreground)] px-1">
                                                            <div className="h-4 w-4 flex items-center justify-center"><Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]/60" /></div>
                                                            <span className="opacity-70 font-normal tracking-tight">Preparing your learning materials...</span>
                                                        </div>
                                                        <div className="space-y-4 w-full opacity-40 px-1 mt-1">
                                                            <div className="h-2 w-full bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" />
                                                            <div className="h-2 w-[85%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                                            <div className="h-2 w-[60%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out fill-mode-both">
                                                        {msg.role === 'user' && msg.is_quiz_submission ? (() => {
                                                            // Compute score from the preceding assistant message
                                                            const prevMsg = i > 0 ? messages[i - 1] : null
                                                            const questions = prevMsg?.questions_for_user
                                                            const answers = prevMsg?.quiz_user_answers
                                                            const total = questions?.length ?? 0
                                                            const correct = questions && answers
                                                                ? questions.reduce((acc, q, qi) => acc + (answers[qi] === q.answer ? 1 : 0), 0)
                                                                : 0
                                                            const pct = total > 0 ? Math.round((correct / total) * 100) : 0
                                                            return (
                                                                <div className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--secondary)]/20 overflow-hidden">
                                                                    {/* Header */}
                                                                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]/50">
                                                                        <div className="flex items-center gap-2">
                                                                            <Check className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.5} />
                                                                            <span className="text-sm font-medium text-[var(--foreground)]">Quiz Submitted</span>
                                                                        </div>
                                                                        <span className="text-xs text-[var(--muted-foreground)]">{total} questions</span>
                                                                    </div>
                                                                    {/* Score body */}
                                                                    <div className="px-4 py-3 flex items-center gap-4">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center justify-between mb-1.5">
                                                                                <span className="text-xs text-[var(--muted-foreground)]">{correct} / {total} correct</span>
                                                                                <span className="text-sm font-semibold text-[var(--foreground)]">{pct}%</span>
                                                                            </div>
                                                                            <div className="h-1.5 rounded-full bg-[var(--secondary)] overflow-hidden">
                                                                                <div className="h-full rounded-full bg-[var(--accent)]/60 transition-all duration-700" style={{ width: `${pct}%` }} />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {/* Per-question dots */}
                                                                    {questions && answers && (
                                                                        <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                                                                            {questions.map((q, qi) => {
                                                                                const isRight = answers[qi] === q.answer
                                                                                return (
                                                                                    <div key={qi} title={`Q${qi + 1}: ${isRight ? 'Correct' : 'Wrong'}`}
                                                                                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${isRight
                                                                                            ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                                                                                            : 'bg-[var(--foreground)]/5 text-[var(--muted-foreground)] border border-[var(--foreground)]/15'
                                                                                            }`}>
                                                                                        {qi + 1}
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })()
                                                            : msg.role === 'user' ? (
                                                                <div className="max-w-none whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)]">
                                                                    {msg.follow_up_content && (
                                                                        <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">{msg.follow_up_content}</div>
                                                                    )}
                                                                    <div>{msg.content}</div>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    {/* Completed steps summary */}
                                                                    {msg.steps && msg.steps.length > 0 && (
                                                                        <details className="px-1 py-1 group mb-2">
                                                                            <summary className="list-none cursor-pointer flex items-center justify-between gap-2">
                                                                                <span className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                                                                                    <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--foreground)]/5"><Check className="h-2 w-2" strokeWidth={4} /></div>
                                                                                    <span className="font-normal">{msg.steps.length} steps completed</span>
                                                                                </span>
                                                                                <span className="text-xs text-[var(--muted-foreground)] transition-transform duration-200 group-open:rotate-180">⌄</span>
                                                                            </summary>
                                                                            <div className="mt-2.5 pl-1.5 border-l border-[var(--border-subtle)]/40 ml-[7px] space-y-2.5">
                                                                                {msg.steps.map((step, idx) => (
                                                                                    <div key={idx} className="flex items-center gap-2.5 text-xs font-normal text-[var(--muted-foreground)]/70">
                                                                                        <div className="h-1 w-1 rounded-full bg-[var(--muted-foreground)]/30" />
                                                                                        <span>{getStepLabel(step)}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </details>
                                                                    )}

                                                                    {/* Answer markdown */}
                                                                    <div className="max-w-none blog-markdown light-chat-markdown markdown-body text-[16px] leading-[1.8]">
                                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeRaw]} components={chatMarkdownComponents}>
                                                                            {preprocessMarkdown(msg.content)}
                                                                        </ReactMarkdown>
                                                                    </div>

                                                                    {/* Quiz */}
                                                                    {msg.questions_for_user && msg.questions_for_user.length > 0 && (
                                                                        <QuizBlock questions={msg.questions_for_user} userAnswers={msg.quiz_user_answers} graded={msg.quiz_graded}
                                                                            onSubmit={(answers) => handleQuizSubmit(i, answers)} />
                                                                    )}

                                                                    {/* Flashcards */}
                                                                    {msg.flashcard && msg.flashcard.length > 0 && (
                                                                        <FlashcardBlock cards={msg.flashcard} />
                                                                    )}

                                                                    {/* Note indicator — InlineResearchBlock-style card */}
                                                                    {msg.note && msg.note.trim() && (
                                                                        <div className="relative mt-5 border border-[var(--border-subtle)] bg-card/50 rounded-xl p-4 sm:p-5 shadow-sm">
                                                                            <div className="flex flex-col gap-3">
                                                                                <div className="flex items-start gap-3 overflow-hidden min-w-0">
                                                                                    <div className="relative flex h-8 w-8 items-center justify-center shrink-0 overflow-hidden rounded-full bg-[var(--foreground)]/5 mt-0.5">
                                                                                        <StickyNote className="h-4 w-4 text-[var(--foreground)]/60" />
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <h3 className="font-semibold text-[var(--foreground)] leading-snug">Study Notes</h3>
                                                                                        <p className="text-xs text-[var(--muted-foreground)] mt-1">Notes ready for review</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 pl-11">
                                                                                    <button onClick={() => {
                                                                                        if (noteOpen) { closeNote() } else { openNote(msg.note!) }
                                                                                    }}
                                                                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm ${noteOpen
                                                                                            ? 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                                                                                            : 'bg-[var(--foreground)] text-[var(--background)] hover:opacity-90'
                                                                                            }`}>
                                                                                        {noteOpen ? 'Close Notes' : 'View Notes'}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Action buttons */}
                                                                    <div className="flex items-center gap-2 mt-2 border-t border-[var(--border-subtle)] pt-2">
                                                                        <button onClick={() => handleCopy(msg.content)} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Copy"><Copy size={14} /></button>
                                                                        <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Helpful"><ThumbsUp size={14} /></button>
                                                                        <button onClick={handleFeatureComingSoon} className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors" title="Not Helpful"><ThumbsDown size={14} /></button>
                                                                    </div>
                                                                </>
                                                            )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Attached files */}
                                            {msg.role === 'user' && msg.attachedFiles && msg.attachedFiles.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 justify-end mt-1.5">
                                                    {msg.attachedFiles.map(file => (
                                                        <div key={file.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--secondary)]/50 text-[var(--muted-foreground)] text-[12px] border border-[var(--border-subtle)]/40">
                                                            <FileText className="h-3 w-3 shrink-0 opacity-60" /><span className="truncate max-w-[160px]">{file.name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Chat input */}
                        <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[var(--background)] border-t border-[var(--border-subtle)]/40">
                            <div className="max-w-2xl mx-auto">
                                {followUpText && (
                                    <div className="flex items-center gap-3 mb-2 px-4 py-3 bg-[var(--secondary)] rounded-xl text-sm border border-[var(--border-subtle)] backdrop-blur-sm max-h-24 overflow-y-auto w-full shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="w-[3px] self-stretch bg-[var(--accent)] rounded-full shrink-0" />
                                        <p className="text-[var(--foreground)] truncate overflow-hidden whitespace-nowrap" title={followUpText}>{followUpText}</p>
                                        <button onClick={() => setFollowUpText('')} className="p-1 hover:bg-[var(--muted)] rounded-md shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-auto" title="Clear"><X size={15} /></button>
                                    </div>
                                )}
                                <div className="flex flex-col bg-white dark:bg-[#121212] rounded-2xl shadow-sm border border-[var(--border-subtle)] focus-within:ring-1 focus-within:ring-[var(--accent)] transition-all">
                                    <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleInputKeyDown}
                                        placeholder="Learn more about..." disabled={isLoading} rows={1}
                                        className="block w-full resize-none bg-transparent text-[var(--foreground)] px-5 pt-4 pb-2 min-h-[60px] max-h-40 overflow-y-auto focus:outline-none text-[15px] placeholder:text-[var(--muted-foreground)]/60" />
                                    <div className="flex items-center justify-end px-3 pb-3 pt-1">
                                        <button onClick={handleSend} disabled={!input.trim() || isLoading}
                                            className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 ${!input.trim() || isLoading ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed' : 'bg-[var(--accent)] text-white hover:opacity-90'}`}>
                                            <ArrowUp size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 text-center text-[11px] sm:text-xs text-[var(--muted-foreground)]/70 px-4 select-none">Answers generated by AI. Check important info.</div>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT: Note panel using FinalAnswer (split-screen, same as canvas report) ── */}
                    {noteOpen && activeNoteContent && (
                        isMobile ? (
                            <div className="fixed inset-0 z-[60] bg-[var(--background)]">
                                <div className="flex-1 flex flex-col min-h-0 h-full bg-[var(--background)] relative">
                                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                        <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24 relative">
                                            <FinalAnswer
                                                answer={activeNoteContent}
                                                sources={[]}
                                                title="Study Notes"
                                                onBack={closeNote}
                                                isSignedIn={isSignedIn ?? false}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)] relative">
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                    <div className="mx-auto max-w-[1200px] px-6 py-8 animate-fade-up pb-24 relative">
                                        <FinalAnswer
                                            answer={activeNoteContent}
                                            sources={[]}
                                            title="Study Notes"
                                            onBack={closeNote}
                                            isSignedIn={isSignedIn ?? false}
                                        />
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    )
}

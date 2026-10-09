'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Link2, Loader2, LogOut, Paperclip, Plus, Send, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MarkdownMessage } from '@/components/markdown-message'
import { AnswerEditor } from '@/components/collector/answer-editor'
import { FieldsPanel } from '@/components/collector/fields-panel'
import { AddUrlPopover } from '@/components/add-url-popover'
import { FileUploadArea } from '@/components/file-upload-area'
import { SourceUrlArea, hostAndPath } from '@/components/source-url-area'
import { QueryPicker } from '@/components/collector/query-picker'
import { QuestionBlock, QuestionSkeleton } from '@/components/question-block'
import {
  ApiError,
  COLLECTOR_MODELS,
  createThread,
  discardThread,
  restartThread,
  getState,
  openGenerate,
  openReconnect,
  readEvents,
  saveFinal,
  stopThread,
  submitThread,
  toGenerateBody,
  type CollectEvent,
  type CollectorModel,
  type SubmitResult,
} from '@/lib/collector/api'
import {
  advanceDatetime,
  defaultFields,
  randomDatetime,
  randomLanguage,
  randomMemory,
  randomPlace,
  randomSkill,
  offsetOfIso,
  shuffleFields,
  validateFields,
  type CollectorFields,
  type FieldKey,
  type TimeRange,
} from '@/lib/collector/fields'
import { parseQuestion } from '@/lib/question-parser'
import { isAllowedUploadFile, UPLOAD_ACCEPT_ATTR } from '@/lib/upload-types'
import { MAX_SOURCE_URLS, extractUrls, lastCompletedUrlToken, normalizeUrl, useSourceUrls, type SourceUrlEntry } from '@/hooks/useSourceUrls'
import type { AttachedFile } from '@/hooks/useFileUpload'
import { useCollectorUploads } from '@/lib/collector/use-uploads'
import type { PreparedQuery } from '@/lib/collector/queries'
import { NO_FILTER, draw, findByText, skillFor, type QueryFilter } from '@/lib/collector/query-pool'
import type { QuestionBlock as QuestionBlockType, Source } from '@/lib/types'

type Phase = 'compose' | 'generating' | 'review' | 'failed'

interface TurnRecord {
  turn: number
  query: string
  fields: CollectorFields
  answer: string
  edited: boolean
  files: string[]
  urls: string[]
}

interface Live {
  text: string
  steps: { tool: string; args: unknown }[]
  thinking: boolean
}

const EMPTY_LIVE: Live = { text: '', steps: [], thinking: false }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const summarizeArgs = (args: unknown) => {
  const s = typeof args === 'string' ? args : JSON.stringify(args ?? {})
  return s.length > 110 ? s.slice(0, 110) + '…' : s
}

function mergeSources(prev: Source[], next: Source[]): Source[] {
  const seen = new Set(prev.map((s) => s.url || `n:${s.n}`))
  return [...prev, ...next.filter((s) => !seen.has(s.url || `n:${s.n}`))]
}

const USED_KEY = 'omni_collector_used_queries'

// search-home.tsx's limits and its stand-in text for a first message with no words.
const MAX_FILES = 5
const MAX_FILE_BYTES = 20 * 1024 * 1024
function fallbackQuery(nFiles: number, nUrls: number): string {
  return nFiles > 1 ? 'Please read these files'
    : nFiles === 1 ? 'Please read this file'
    : nUrls > 1 ? 'Please read these sources'
    : nUrls === 1 ? 'Please read this source'
    : ''
}
const FALLBACKS = new Set(['Please read these files', 'Please read this file', 'Please read these sources', 'Please read this source'])

/** What a turn carried, as small pills (the chat shows the same on a sent message). */
function AttachmentPills({ files, urls }: { files: string[]; urls: string[] }) {
  if (!files.length && !urls.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <span key={`f${i}`} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-2.5 py-1 text-[12px] text-[var(--ink-soft)]">
          <Paperclip size={12} strokeWidth={1.75} className="shrink-0" /><span className="truncate">{f}</span>
        </span>
      ))}
      {urls.map((u, i) => (
        <span key={`u${i}`} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-2.5 py-1 text-[12px] text-[var(--ink-soft)]">
          <Link2 size={12} strokeWidth={1.75} className="shrink-0" /><span className="truncate">{hostAndPath(u).host}{hostAndPath(u).path !== '/' ? hostAndPath(u).path : ''}</span>
        </span>
      ))}
    </div>
  )
}

function loadUsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(USED_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** A turn's answer split the way the chat splits it: prose, and the question form if there is one. */
function AnswerWithQuestion({ answer, sources, replyTo, onReply }: {
  answer: string
  sources: Source[]
  /** The reply that was sent, when this question has been answered. */
  replyTo?: string
  /** Given: the form is live and calls this with the formatted reply. */
  onReply?: (formatted: string) => void
}) {
  const parsed = useMemo(() => parseQuestion(answer), [answer])
  return (
    <div className="space-y-3">
      {parsed.text.trim() && <MarkdownMessage content={parsed.text} sources={sources} />}
      {parsed.question && (
        <QuestionBlock
          key={JSON.stringify(parsed.question)}
          question={parsed.question as QuestionBlockType}
          onSubmit={(a) => onReply?.(a)}
          answered={replyTo !== undefined}
          answeredText={replyTo}
        />
      )}
    </div>
  )
}

export function CollectorClient({ annotator }: { annotator: string }) {
  // ── the inputs ───────────────────────────────────────────────────────────
  const [fields, setFields] = useState<CollectorFields>(() => defaultFields())
  const [locked, setLocked] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [range, setRange] = useState<TimeRange>('near')
  const [model, setModel] = useState<CollectorModel>('best')
  const [query, setQuery] = useState('')
  const [queryFilter, setQueryFilter] = useState<QueryFilter>(NO_FILTER)
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set())
  const [drawn, setDrawn] = useState<PreparedQuery | null>(null)
  const [turnIsReply, setTurnIsReply] = useState(false)
  const [replyNonce, setReplyNonce] = useState(0)

  // What the next message will carry: files uploaded to this conversation, pinned URLs.
  const uploads = useCollectorUploads()
  const { sourceUrls, addUrls, removeUrl, clearUrls, setSourceUrls } = useSourceUrls()
  const sourceUrlsCountRef = useRef(0)
  sourceUrlsCountRef.current = sourceUrls.length
  const [addUrlOpen, setAddUrlOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prefilledUrlsRef = useRef<Set<string>>(new Set())
  // What the turn on screen was sent with — kept so a regenerate can send it again.
  const [turnAttach, setTurnAttach] = useState<{ files: AttachedFile[]; urls: SourceUrlEntry[] }>({ files: [], urls: [] })

  // ── the conversation ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('compose')
  const [threadId, setThreadId] = useState<string | null>(null)
  const [turns, setTurns] = useState<TurnRecord[]>([])
  const [turnQuery, setTurnQuery] = useState('')
  const [turnNumber, setTurnNumber] = useState(0)
  const [live, setLive] = useState<Live>(EMPTY_LIVE)
  const [sources, setSources] = useState<Source[]>([])
  const [original, setOriginal] = useState('') // the model's own answer to this turn
  const [saved, setSaved] = useState('') // what the checkpoint holds now
  const [draft, setDraft] = useState('') // what the editor shows
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null)
  const [busy, setBusy] = useState<null | 'continue' | 'submit' | 'discard'>(null)
  const [error, setError] = useState<string | null>(null)

  const threadRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  threadRef.current = threadId

  useEffect(() => { setUsedIds(loadUsed()) }, [])

  const memoryAllowed = turns.length === 0
  const inputsOpen = phase === 'compose'
  const errors = useMemo(
    () => validateFields({ ...fields, memory: memoryAllowed ? fields.memory : '' }, { memoryAllowed: true }),
    [fields, memoryAllowed],
  )
  const readyFiles = uploads.files.filter((f) => f.status === 'ready').length
  // chat-view: a later message may go with files and no words, never with a URL alone; the
  // first one falls back to "Please read this source".
  const canSend =
    errors.length === 0 &&
    !uploads.files.some((f) => f.status === 'uploading') &&
    (!!query.trim() || readyFiles > 0 || (turns.length === 0 && sourceUrls.length > 0))

  // Warn before closing a tab that holds work nobody filed.
  useEffect(() => {
    const dirty = !!threadId && phase !== 'compose' && !(submitted && submitted.turn === turnNumber && draft === saved)
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [threadId, phase, submitted, turnNumber, draft, saved])

  // ── field editing and shuffling ──────────────────────────────────────────
  const patchFields = useCallback((p: Partial<CollectorFields>) => setFields((f) => ({ ...f, ...p })), [])
  const toggleLock = useCallback((k: FieldKey) => setLocked((l) => ({ ...l, [k]: !l[k] })), [])

  const shuffleOne = useCallback((k: FieldKey) => {
    setFields((f) => {
      switch (k) {
        case 'location': {
          // a new place carries its own clock unless the time is pinned
          const loc = randomPlace().location
          return {
            ...f,
            location: loc,
            datetime: locked.datetime ? f.datetime : randomDatetime({ location: loc, fallbackOffset: offsetOfIso(f.datetime) ?? 0, range }),
          }
        }
        case 'datetime':
          return { ...f, datetime: randomDatetime({ location: f.location, fallbackOffset: offsetOfIso(f.datetime) ?? 0, range }) }
        case 'language':
          return { ...f, language: randomLanguage() }
        case 'memory':
          return { ...f, memory: randomMemory() }
        case 'skill':
          return { ...f, skill: randomSkill() }
      }
    })
  }, [locked.datetime, range])

  const shuffleAll = useCallback(() => {
    setFields((f) => shuffleFields(f, locked, { range, memoryAllowed }))
  }, [locked, range, memoryAllowed])

  // ── talking to the backend ───────────────────────────────────────────────
  const applyEvent = useCallback((ev: CollectEvent, out: { error?: string }) => {
    switch (ev.type) {
      case 'text':
        setLive((l) => ({ ...l, text: l.text + ev.content, thinking: false }))
        break
      case 'reasoning':
        setLive((l) => ({ ...l, thinking: true }))
        break
      case 'tool_call':
        setLive((l) => ({ ...l, steps: [...l.steps, { tool: ev.tool, args: ev.args }], thinking: false }))
        break
      case 'sources':
        setSources((s) => mergeSources(s, ev.sources ?? []))
        break
      case 'error':
        out.error = ev.message || 'The turn failed.'
        break
      case 'stopped':
        // A stopped answer is cut off mid-sentence; it must not be filed as if it were whole.
        out.error = 'Generation was stopped. Discard this conversation and start again.'
        break
    }
  }, [])

  /** After the stream closes, wait for the server to settle and load the answer as the checkpoint has it. */
  const settle = useCallback(async (id: string, streamError?: string) => {
    for (let i = 0; i < 90; i++) {
      const st = await getState(id)
      if (!st.is_generating) {
        if (streamError || !st.complete || st.final_text == null) {
          setError(streamError || 'The turn did not end on a finished answer. Discard this conversation and try again.')
          setPhase('failed')
          return
        }
        setTurnNumber(st.turn)
        setOriginal(st.final_text)
        setSaved(st.final_text)
        setDraft(st.final_text)
        setPhase('review')
        return
      }
      await sleep(1000)
    }
    setError('The backend is still generating after 90 s. Reload the state or discard the conversation.')
    setPhase('failed')
  }, [])

  const consume = useCallback(async (first: Response, id: string, ctl: AbortController) => {
    const out: { error?: string } = {}
    let res = first
    for (let attempt = 0; ; attempt++) {
      try {
        for await (const ev of readEvents(res)) applyEvent(ev, out)
        break
      } catch (e) {
        if (ctl.signal.aborted || attempt >= 2) throw e
        // The stream dropped mid-answer (a serverless proxy timing out, a flaky link):
        // the backend keeps generating, so re-attach and replay it from the top.
        setLive(EMPTY_LIVE)
        await sleep(800)
        res = await openReconnect(id, ctl.signal)
      }
    }
    await settle(id, out.error)
  }, [applyEvent, settle])

  /** The conversation's thread, created on first need — an upload needs one before any turn runs. */
  const ensureThread = useCallback(async (): Promise<string> => {
    if (threadRef.current) return threadRef.current
    const id = await createThread()
    setThreadId(id)
    threadRef.current = id
    return id
  }, [])

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
    if (!files.length) return
    if (uploads.files.length + files.length > MAX_FILES) {
      toast.error(`You can only attach up to ${MAX_FILES} files per message.`)
      return
    }
    let id: string
    try { id = await ensureThread() } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a conversation.')
      return
    }
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) { toast.error(`${file.name} is too large. Maximum size is 20MB.`); continue }
      if (!isAllowedUploadFile(file)) { toast.error(`${file.name} is not a supported file type.`); continue }
      uploads.upload(file, id).catch((e) => toast.error(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`))
    }
  }, [uploads, ensureThread])

  // Auto-detect sweetener, as in search-home.tsx: a URL pasted or typed into the box is
  // queued as a pinned source on its own, the text left untouched.
  const autoDetectUrls = useCallback((candidates: string[]) => {
    if (!candidates.length) return
    if (sourceUrlsCountRef.current >= MAX_SOURCE_URLS) {
      toast.error(`You can only add up to ${MAX_SOURCE_URLS} sources per message.`)
      return
    }
    sourceUrlsCountRef.current += candidates.length
    addUrls(candidates)
  }, [addUrls])

  const onComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      void addFiles(files)
      return
    }
    const text = e.clipboardData?.getData('text')
    if (text) autoDetectUrls(extractUrls(text))
  }

  const onQueryChange = (val: string) => {
    setQuery(val)
    if (drawn && val.trim() !== drawn.text) setDrawn(null)
    const completed = lastCompletedUrlToken(val)
    if (completed) autoDetectUrls([completed])
  }

  const runTurn = useCallback(async (opts: {
    fresh?: boolean
    queryOverride?: string
    /** For callers that have just changed the inputs and are running before React re-renders. */
    fieldsOverride?: CollectorFields
    firstTurn?: boolean
    /** This turn's query is the formatted answer to a <question> form. */
    reply?: boolean
    /** Files / URLs to send instead of the staged ones (a regenerate sends the same again). */
    files?: AttachedFile[]
    urls?: SourceUrlEntry[]
  } = {}) => {
    const first = opts.firstTurn ?? memoryAllowed
    if (!opts.files && uploads.files.some((f) => f.status === 'uploading')) {
      return setError('Please wait for the file to finish uploading.')
    }
    const sendFiles = (opts.files ?? uploads.files).filter((f) => f.status === 'ready')
    const sendUrls = opts.urls ?? sourceUrls
    // The first message with no words gets search-home's stand-in text; a later one may be
    // empty only if it has files, and cannot be sent on URLs alone (chat-view's send).
    const typed = (opts.queryOverride ?? query).trim()
    const q = typed || (first ? fallbackQuery(sendFiles.length, sendUrls.length) : '')
    if (!q && sendFiles.length === 0) return setError(first ? 'Write a query, or attach a file or a URL.' : 'Write a query, or attach a file.')
    const f = opts.fieldsOverride ?? fields
    const problems = opts.fieldsOverride ? validateFields({ ...f, memory: first ? f.memory : '' }) : errors
    if (problems.length) return setError(problems[0])
    setError(null)
    setTurnIsReply(!!opts.reply)
    // A prepared query that actually gets run is spent: random draws skip it from now on.
    const prepared = findByText(q)
    if (prepared) {
      setUsedIds((u) => {
        const next = new Set(u).add(prepared.id)
        try { localStorage.setItem(USED_KEY, JSON.stringify([...next])) } catch {}
        return next
      })
    }
    setSubmitted(null)
    const ctl = new AbortController()
    abortRef.current = ctl
    // What is staged goes out with this message and is cleared, as in the chat; a refused
    // request puts it back.
    const sent = { files: sendFiles, urls: sendUrls }
    try {
      const id = await ensureThread()
      setTurnQuery(q)
      setTurnAttach(sent)
      uploads.clear(); clearUrls(); setAddUrlOpen(false)
      setLive(EMPTY_LIVE)
      setPhase('generating')
      const res = await openGenerate(
        toGenerateBody({
          query: q, threadId: id, fields: f, model, includeMemory: first,
          files: sendFiles.map((x) => ({ id: x.id, name: x.name })), urls: sendUrls.map((x) => x.url),
        }),
        ctl.signal,
      )
      await consume(res, id, ctl)
    } catch (e) {
      if (ctl.signal.aborted) return
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Request failed.')
      // A refused request (400/409/422) leaves the thread usable; anything after the model started does not.
      const refused = e instanceof ApiError && e.status < 500
      if (refused) { uploads.setFiles(sent.files); setSourceUrls(sent.urls) }
      setPhase(refused ? 'compose' : 'failed')
    }
  }, [query, errors, fields, model, memoryAllowed, consume, uploads, sourceUrls, ensureThread, clearUrls, setSourceUrls])


  const stop = async () => {
    if (!threadId) return
    try { await stopThread(threadId) } catch {}
  }

  const dropThread = async () => {
    const id = threadRef.current
    abortRef.current?.abort()
    setThreadId(null)
    threadRef.current = null
    if (id) { try { await discardThread(id) } catch {} }
  }

  const resetConversation = () => {
    setTurns([]); setPhase('compose'); setLive(EMPTY_LIVE); setSources([]); setOriginal(''); setSaved('')
    setDraft(''); setNote(''); setSubmitted(null); setError(null); setQuery(''); setTurnQuery(''); setTurnNumber(0)
    setTurnIsReply(false); setDrawn(null)
  }

  const newConversation = async () => {
    const unfiled = threadId && phase !== 'compose' && !(submitted && submitted.turn === turnNumber && draft === saved)
    if (unfiled && !window.confirm('This conversation has not been submitted. Discard it?')) return
    setBusy('discard')
    await dropThread()   // the server deletes the conversation's uploads with it
    resetConversation()
    uploads.clear(); clearUrls(); setTurnAttach({ files: [], urls: [] }); setAddUrlOpen(false)
    setBusy(null)
  }

  /** A fresh checkpoint for the same conversation: the staged files follow to a new thread. */
  const restartKeepingFiles = async () => {
    const id = threadRef.current
    abortRef.current?.abort()
    if (!id) return
    const next = await restartThread(id)
    setThreadId(next)
    threadRef.current = next
  }

  /** Turn 1 only: throw the thread away and generate the same query again. */
  const regenerate = async () => {
    if (draft !== original && !window.confirm('Regenerating discards your edits. Continue?')) return
    const q = turnQuery
    const att = turnAttach
    setBusy('discard')
    try { await restartKeepingFiles() } catch (e) {
      setBusy(null)
      return setError(e instanceof Error ? e.message : 'Could not restart.')
    }
    setBusy(null)
    setSources([])
    await runTurn({ queryOverride: q, files: att.files, urls: att.urls })
  }

  /** Turn 1 only: back to the inputs, keeping them and the query, to change something and run again. */
  const backToInputs = async () => {
    if (draft !== original && !window.confirm('Going back discards your edits. Continue?')) return
    const q = turnQuery
    const att = turnAttach
    setBusy('discard')
    try { await restartKeepingFiles() } catch (e) {
      setBusy(null)
      return setError(e instanceof Error ? e.message : 'Could not restart.')
    }
    setBusy(null)
    resetConversation()
    // back in the composer exactly as it was: the words (not the stand-in text), the files, the URLs
    setQuery(FALLBACKS.has(q) && (att.files.length || att.urls.length) ? '' : q)
    uploads.setFiles(att.files)
    setSourceUrls(att.urls)
  }

  const flushEdit = async (id: string) => {
    if (draft !== saved) {
      await saveFinal(id, draft)
      setSaved(draft)
    }
  }

  /** Save this turn's edit and move to the next one. With `nextQuery` (a reply to the
   *  question form) the next turn is started straight away, as the chat does. */
  const continueConversation = async (opts: { nextQuery?: string } = {}) => {
    if (!threadId) return
    setBusy('continue')
    setError(null)
    try {
      await flushEdit(threadId)
      const nextFields = locked.datetime ? fields : { ...fields, datetime: advanceDatetime(fields.datetime) }
      setTurns((t) => [...t, {
        turn: turnNumber, query: turnQuery, fields, answer: draft, edited: draft !== original,
        files: turnAttach.files.map((x) => x.name), urls: turnAttach.urls.map((x) => x.url),
      }])
      setFields(nextFields)
      setNote(''); setLive(EMPTY_LIVE); setPhase('compose')
      if (opts.nextQuery !== undefined) {
        setBusy(null)
        await runTurn({ queryOverride: opts.nextQuery, fieldsOverride: nextFields, firstTurn: false, reply: true })
      } else {
        setQuery('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the edit.')
      setReplyNonce((n) => n + 1) // a form that thinks it was answered must be answerable again
    } finally {
      setBusy(null)
    }
  }

  /** The form's reply. In review the edit is saved first; in compose (the annotator skipped
   *  ahead) the turn is already filed and the reply is simply the next query. */
  const replyToQuestion = (formatted: string) => {
    if (phase === 'review') void continueConversation({ nextQuery: formatted })
    else if (phase === 'compose') void runTurn({ queryOverride: formatted, reply: true })
  }

  // ── choosing a prepared query ────────────────────────────────────────────
  const pickQuery = useCallback((q: PreparedQuery) => {
    setQuery(q.text)
    setDrawn(q)
    // A query designed around pinned URLs brings them; the previous query's go away.
    const stale = prefilledUrlsRef.current
    if (stale.size) setSourceUrls((prev) => prev.filter((e) => !stale.has(e.url)))
    prefilledUrlsRef.current = new Set()
    if (q.source_url?.length) {
      addUrls(q.source_url)
      prefilledUrlsRef.current = new Set(q.source_url.map((u) => normalizeUrl(u)).filter((u): u is string => !!u))
    }
    setFields((f) => (locked.skill ? f : { ...f, skill: skillFor(q) || f.skill }))
  }, [locked.skill, addUrls, setSourceUrls])

  const randomQuery = useCallback((): PreparedQuery | null => {
    const q = draw(queryFilter, usedIds)
    if (!q) {
      setError('Every prepared query matching this filter has been used. Reset the used list or change the filter.')
      return null
    }
    setError(null)
    pickQuery(q)
    return q
  }, [queryFilter, usedIds, pickQuery])

  const randomEverything = () => {
    const q = randomQuery()
    if (!q) return
    // shuffle the context too; the drawn query's own skill (if its design had one) wins over a random one
    setFields((f) => {
      const next = shuffleFields(f, locked, { range, memoryAllowed }, Math.random)
      return locked.skill ? next : { ...next, skill: skillFor(q) || next.skill }
    })
  }

  const resetUsed = () => {
    setUsedIds(new Set())
    try { localStorage.removeItem(USED_KEY) } catch {}
  }

  const submit = async () => {
    if (!threadId) return
    setBusy('submit')
    setError(null)
    try {
      await flushEdit(threadId)
      const r = await submitThread(threadId, note.trim() || undefined)
      setSubmitted(r)
      toast.success(r.edited ? `Saved as accepted (edited) · #${r.id}` : `Saved as pending (unedited) · #${r.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit.')
    } finally {
      setBusy(null)
    }
  }

  const signOut = async () => {
    await fetch('/api/collect/logout', { method: 'POST' })
    window.location.href = '/collect/login'
  }

  const onComposerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void runTurn() }
  }

  const submittedHere = submitted?.turn === turnNumber && draft === saved

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-instrument)] text-[30px] leading-none text-[var(--ink)]">Collector</h1>
        <span className="rounded-full bg-[var(--teal-tint)] px-2.5 py-1 text-[12px] text-[var(--teal)]">{annotator}</span>
        {threadId && (
          <span className="font-[family-name:var(--font-plex-mono)] text-[11.5px] text-[var(--ink-faint)]">
            {threadId.slice(0, 8)} · turn {turns.length * 2 + 1}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={newConversation} disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-1.5 text-[12.5px] text-[var(--ink)] hover:bg-[var(--sand)] disabled:opacity-50">
            <Plus size={14} strokeWidth={1.75} /> New conversation
          </button>
          <button onClick={signOut} title="Sign out"
            className="rounded-full p-2 text-[var(--ink-muted)] hover:bg-[var(--sand)]"><LogOut size={15} strokeWidth={1.75} /></button>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2">
          <FieldsPanel
            fields={fields} onChange={patchFields} locked={locked} onToggleLock={toggleLock}
            onShuffleField={shuffleOne} onShuffleAll={shuffleAll} range={range} onRangeChange={setRange}
            memoryAllowed={memoryAllowed} disabled={!inputsOpen} errors={inputsOpen ? errors : []}
          />
          <div className="space-y-1.5">
            <label className="omni-eyebrow">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value as CollectorModel)} disabled={!inputsOpen}
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--teal)] disabled:opacity-60">
              {COLLECTOR_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <p className="text-[11.5px] text-[var(--ink-muted)]">Teacher models only — anything else is refused when you submit.</p>
          </div>
        </aside>

        <section className="min-w-0 space-y-8">
          {turns.map((t, idx) => {
            // The reply to this turn's question form is the next turn's query — already
            // run (it is in `turns`), or running / reviewed now (`turnQuery`), or not given yet.
            const nextQuery = turns[idx + 1]?.query ?? (phase !== 'compose' ? turnQuery : undefined)
            const awaitingReply = idx === turns.length - 1 && phase === 'compose'
            return (
            <details key={t.turn} open={awaitingReply && !!parseQuestion(t.answer).question} className="group rounded-xl border border-[var(--line)] bg-[var(--paper-raised)]">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                <ChevronDown size={15} className="shrink-0 text-[var(--ink-faint)] transition-transform group-open:rotate-180" />
                <span className="truncate text-[14px] text-[var(--ink)]">{t.query || t.files[0] || t.urls[0]}</span>
                {t.edited && <span className="shrink-0 rounded-full bg-[var(--rust-tint)] px-2 py-0.5 text-[11.5px] text-[var(--rust)]">edited</span>}
                <span className="ml-auto shrink-0 font-[family-name:var(--font-plex-mono)] text-[11px] text-[var(--ink-faint)]">turn {t.turn}</span>
              </summary>
              <div className="space-y-3 border-t border-[var(--line)] px-4 py-4">
                <p className="font-[family-name:var(--font-plex-mono)] text-[11.5px] text-[var(--ink-muted)]">
                  {t.fields.datetime}{t.fields.location ? ` · ${t.fields.location}` : ''} · {t.fields.language || 'auto'}{t.fields.skill ? ` · skill: ${t.fields.skill}` : ''}
                </p>
                <AttachmentPills files={t.files} urls={t.urls} />
                <AnswerWithQuestion
                  answer={t.answer}
                  sources={sources}
                  replyTo={awaitingReply ? undefined : nextQuery}
                  onReply={awaitingReply ? replyToQuestion : undefined}
                />
              </div>
            </details>
            )
          })}

          {phase !== 'compose' && (
            <div className="space-y-1">
              <p className="omni-eyebrow">{turnIsReply ? 'Reply to the question' : 'Query'}</p>
              {turnQuery && <p className={`whitespace-pre-wrap text-[var(--ink)] ${turnIsReply ? 'text-[15px] leading-relaxed' : 'font-[family-name:var(--font-instrument)] text-[26px] leading-tight'}`}>{turnQuery}</p>}
              <AttachmentPills files={turnAttach.files.map((x) => x.name)} urls={turnAttach.urls.map((x) => x.url)} />
            </div>
          )}

          {phase === 'compose' && (
            <div className="space-y-3">
              <label className="omni-eyebrow">{turns.length ? `Follow-up (turn ${turns.length * 2 + 1})` : 'Query'}</label>
              {turns.length === 0 && (
                <QueryPicker
                  filter={queryFilter} onFilter={setQueryFilter} used={usedIds}
                  onRandom={randomQuery} onRandomAll={randomEverything} onPick={pickQuery} onResetUsed={resetUsed}
                  drawn={drawn}
                />
              )}
              {(uploads.files.length > 0 || sourceUrls.length > 0) && (
                <div className="space-y-2">
                  <FileUploadArea files={uploads.files} onRemove={uploads.remove} />
                  <SourceUrlArea urls={sourceUrls} onRemove={removeUrl} />
                </div>
              )}
              <textarea
                value={query} onChange={(e) => onQueryChange(e.target.value)} onKeyDown={onComposerKey} onPaste={onComposerPaste}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { setDragOver(false); if (e.dataTransfer.files.length) { e.preventDefault(); void addFiles(e.dataTransfer.files) } }}
                placeholder={turns.length ? 'Ask the follow-up…' : 'Ask anything…'}
                rows={4}
                className={`w-full resize-y rounded-xl border bg-[var(--paper-raised)] p-4 text-[15px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--teal)] ${dragOver ? 'border-[var(--teal)] bg-[var(--teal-tint)]' : 'border-[var(--line-strong)]'}`}
              />
              <input ref={fileInputRef} type="file" multiple accept={UPLOAD_ACCEPT_ATTR} className="hidden"
                onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
              <div className="relative flex flex-wrap items-center gap-3">
                <button onClick={() => runTurn()} disabled={!canSend}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--teal)] px-5 py-2.5 text-[13.5px] text-[var(--accent-foreground)] transition-all hover:bg-[var(--teal-hover)] active:scale-[0.98] disabled:opacity-40">
                  <Send size={14} strokeWidth={1.75} /> Generate
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploads.files.length >= MAX_FILES}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3.5 py-2 text-[12.5px] text-[var(--ink)] hover:bg-[var(--sand)] disabled:opacity-40">
                  <Paperclip size={14} strokeWidth={1.75} /> Attach file or image
                </button>
                <button type="button" onClick={() => setAddUrlOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3.5 py-2 text-[12.5px] text-[var(--ink)] hover:bg-[var(--sand)]">
                  <Link2 size={14} strokeWidth={1.75} /> Add URL
                </button>
                <span className="text-[12px] text-[var(--ink-faint)]">Ctrl/⌘ + Enter</span>
                {addUrlOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2 w-[min(420px,100%)] rounded-xl border border-[var(--line-strong)] bg-[var(--paper-raised)] shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)]">
                    <AddUrlPopover existingCount={sourceUrls.length} onAdd={addUrls} onClose={() => setAddUrlOpen(false)} />
                  </div>
                )}
              </div>
              {!canSend && uploads.files.some((f) => f.status === 'uploading') && (
                <p className="text-[12px] text-[var(--ink-faint)]">Waiting for the upload to finish…</p>
              )}
            </div>
          )}

          {phase === 'generating' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 size={15} className="animate-spin text-[var(--teal)]" />
                <span className="omni-shimmer-text text-[13px]">{live.thinking ? 'Thinking…' : live.text ? 'Writing…' : 'Working…'}</span>
                <button onClick={stop} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-[12.5px] text-[var(--ink)] hover:bg-[var(--sand)]">
                  <Square size={12} strokeWidth={1.75} /> Stop
                </button>
              </div>
              {live.steps.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-[var(--sand)] px-3 py-2.5">
                  {live.steps.map((s, i) => (
                    <li key={i} className="truncate font-[family-name:var(--font-plex-mono)] text-[12px] text-[var(--ink-soft)]">
                      <span className="text-[var(--teal)]">{s.tool}</span> {summarizeArgs(s.args)}
                    </li>
                  ))}
                </ul>
              )}
              {(() => {
                // The chat draws a <question> block as a form, never as text; while it is
                // still streaming in, a skeleton stands where the form will be.
                const p = parseQuestion(live.text)
                return (
                  <>
                    {p.text.trim() && <MarkdownMessage content={p.text} sources={sources} hideCitations />}
                    {p.questionPending && <QuestionSkeleton />}
                  </>
                )
              })()}
            </div>
          )}

          {phase === 'review' && (
            <div className="space-y-4">
              {live.steps.length > 0 && (
                <details className="rounded-lg bg-[var(--sand)] px-3 py-2">
                  <summary className="cursor-pointer text-[12.5px] text-[var(--ink-soft)]">{live.steps.length} tool call{live.steps.length > 1 ? 's' : ''}</summary>
                  <ul className="mt-2 space-y-1">
                    {live.steps.map((s, i) => (
                      <li key={i} className="truncate font-[family-name:var(--font-plex-mono)] text-[12px] text-[var(--ink-soft)]">
                        <span className="text-[var(--teal)]">{s.tool}</span> {summarizeArgs(s.args)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <AnswerEditor value={draft} original={original} saved={saved} onChange={setDraft} sources={sources} disabled={busy !== null} />

              {(() => {
                const q = parseQuestion(draft).question
                if (!q) return null
                return (
                  <div className="space-y-1.5">
                    <p className="omni-eyebrow">The agent asked a question — reply here to continue</p>
                    <QuestionBlock
                      key={`${replyNonce}:${JSON.stringify(q)}`}
                      question={q as QuestionBlockType}
                      onSubmit={replyToQuestion}
                    />
                    <p className="text-[12px] text-[var(--ink-faint)]">
                      Your reply is sent as the next turn exactly as the chat sends it, after saving any edit above.
                    </p>
                  </div>
                )
              })()}

              {sources.length > 0 && (
                <details className="rounded-lg border border-[var(--line)] px-3 py-2">
                  <summary className="cursor-pointer text-[12.5px] text-[var(--ink-soft)]">{sources.length} source{sources.length > 1 ? 's' : ''} — check the [n] markers against these</summary>
                  <ol className="mt-2 space-y-1 text-[12.5px] text-[var(--ink-soft)]">
                    {sources.map((s, i) => (
                      <li key={i} className="truncate">
                        <span className="font-[family-name:var(--font-plex-mono)] text-[var(--teal)]">[{s.n ?? i + 1}]</span>{' '}
                        {s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline decoration-[var(--line-strong)] underline-offset-2">{s.title || s.url}</a> : s.title}
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Note (optional)"
                  className="min-w-[180px] flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--teal)]" />
                <button onClick={() => continueConversation()} disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--paper-raised)] px-4 py-2.5 text-[13.5px] text-[var(--ink)] hover:bg-[var(--sand)] disabled:opacity-50">
                  {busy === 'continue' && <Loader2 size={14} className="animate-spin" />} Next turn
                </button>
                <button onClick={submit} disabled={busy !== null || !draft.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--teal)] px-5 py-2.5 text-[13.5px] text-[var(--accent-foreground)] hover:bg-[var(--teal-hover)] disabled:opacity-40">
                  {busy === 'submit' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2} />}
                  Submit {draft !== original ? '(accepted)' : '(pending)'}
                </button>
              </div>

              {submittedHere && (
                <p className="flex items-center gap-2 text-[13px] text-[var(--teal)]">
                  <Check size={14} strokeWidth={2} />
                  Filed as #{submitted!.id} — {submitted!.status}{submitted!.edited ? ' (edited)' : ' (unedited)'}. You can keep going with another turn, or start a new conversation.
                </p>
              )}

              {turns.length === 0 && (
                <div className="flex gap-4 text-[12.5px] text-[var(--ink-muted)]">
                  <button onClick={regenerate} disabled={busy !== null} className="underline underline-offset-2 hover:text-[var(--ink)]">Regenerate</button>
                  <button onClick={backToInputs} disabled={busy !== null} className="underline underline-offset-2 hover:text-[var(--ink)]">Change inputs and regenerate</button>
                </div>
              )}
            </div>
          )}

          {phase === 'failed' && (
            <div className="flex items-center gap-3">
              <button onClick={newConversation} className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-4 py-2 text-[13px] text-[var(--ink)] hover:bg-[var(--sand)]">
                <Trash2 size={14} strokeWidth={1.75} /> Discard conversation
              </button>
              {threadId && <button onClick={() => { setError(null); setPhase('generating'); void settle(threadId) }} className="text-[13px] underline underline-offset-2 text-[var(--ink-muted)]">Check again</button>}
            </div>
          )}

          {error && <p role="alert" className="rounded-lg border border-[var(--rust)]/30 bg-[var(--rust-tint)] px-3 py-2 text-[13px] text-[var(--rust)]">{error}</p>}
        </section>
      </div>
    </div>
  )
}

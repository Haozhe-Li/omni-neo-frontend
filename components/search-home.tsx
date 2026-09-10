'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, Menu, ChevronDown, Check, Lock, Mic, Loader2, X, Plus, Paperclip, Link2, Telescope, Plane, GraduationCap } from 'lucide-react'
import { useApi } from '@/hooks/useApi'
import { SignUpButton, useAuth, useClerk, useUser } from '@clerk/nextjs'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'
import { useSourceUrls, MAX_SOURCE_URLS, extractUrls, lastCompletedUrlToken } from '@/hooks/useSourceUrls'
import { SourceUrlArea } from '@/components/source-url-area'
import { AddUrlPopover } from '@/components/add-url-popover'
import { isAllowedUploadFile, UPLOAD_ACCEPT_ATTR } from '@/lib/upload-types'
import { ModelPicker } from '@/components/model-picker'
import { DEFAULT_MODEL, IMAGE_UNSUPPORTED_MESSAGE, getModel, type ChatModelId } from '@/lib/models'

import { toast } from 'sonner'


type SkillId = 'deep-research' | 'trip-advisor' | 'guided-learning'
const SKILLS: { id: SkillId; label: string; desc: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'deep-research',   label: 'Deep Research',   desc: 'Get a detailed report',        Icon: Telescope },
  { id: 'trip-advisor',    label: 'Trip Advisor',     desc: 'Plan your next trip',          Icon: Plane },
  { id: 'guided-learning', label: 'Guided Learning',  desc: 'Learn something step by step', Icon: GraduationCap },
]

const SKILL_PLACEHOLDERS: Record<string, string[]> = {
  'deep-research': [
    "Research the history of artificial intelligence",
    "Deep dive into climate change and its global effects",
    "Investigate the science behind CRISPR gene editing",
    "Explore the economics of renewable energy",
  ],
  'trip-advisor': [
    "Plan me a 3 day round trip to Tokyo",
    "Design a 1 week itinerary for Bali",
    "Find the best hidden gems in Barcelona",
    "Plan a romantic weekend getaway in Paris",
  ],
  'guided-learning': [
    "Teach me how neural networks actually work",
    "Explain quantum physics from scratch",
    "Help me understand how the stock market works",
    "Walk me through the basics of machine learning",
  ],
}

/* ── Signed-in headlines ───────────────────────────────────────────────────
   Someone who is signed in gets greeted, not interviewed. The signed-out
   headline asks a question of a stranger; these open a session with someone
   the product already knows, so they are warmer, shorter, and deliberately
   NOT variations on the same sentence — a personalised line that is just the
   generic one with a name bolted to the front reads as a mail merge.

   One is drawn per page load rather than per user, so the screen is not
   identical every single morning. Each keeps exactly one italic word, which
   is the accent the display serif is built around; the phrasing varies, the
   composition does not. */
const SIGNED_IN_HEADLINES: ((name: string) => React.ReactNode)[] = [
  (n) => (<>Let&rsquo;s <em>jump in</em>, {n}.</>),
  (n) => (<>{n}, wanna <em>know</em> something new?</>),
  (n) => (<>{n}, what&rsquo;s on your <em>mind</em>?</>),
  (n) => (<>Where shall we <em>start</em>, {n}?</>),
  (n) => (<>Good to see you, {n}. What&rsquo;s <em>next</em>?</>),
  (n) => (<>{n}, what should we <em>dig into</em>?</>),
  (n) => (<>Ready when you are, <em>{n}</em>.</>),
]

const SUGGESTED_QUERIES = [
  "Is it rainy today?",
  "What is the difference between sea lions and seals?",
  "How do black holes form?",
  "What should I cook for dinner tonight?",
  "Explain quantum entanglement in simple terms",
  "What are the best habits for better sleep?",
  "How does GPS actually work?",
  "Why is the sky blue?",
  "What are the health benefits of coffee?",
  "How does the internet work?",
  "What causes the northern lights?",
  "Explain compound interest like I'm five",
  "What's the tallest mountain on Earth?",
  "How do bees make honey?",
  "Why do we dream?",
  "What is the speed of light?",
  "How do vaccines work?",
  "What's the difference between affect and effect?",
  "How do I learn a new language quickly?",
  "What is the largest animal that ever lived?",
]

interface SearchHomeProps {
  onSearch: (query: string, threadId: string, attachedFileIds?: string[], attachedFileMeta?: { id: string; name: string; type: string }[], skill?: SkillId | null, sourceUrls?: string[]) => void
  isAutoDetecting?: boolean
  onToggleSidebar?: () => void
  /** Mobile-only header button. Resets the composer's own staged state
   * (attachments, skill, deep-link fill) — see `handleNewSearch` in
   * app/page.tsx, the same reset a sidebar "New thread" click runs. */
  onNewChat?: () => void
  isMobile?: boolean
  model?: ChatModelId
  onModelChange?: (model: ChatModelId) => void
  /** Usage exhausted (guest-only) — locks every model uniformly, no per-model breakdown. */
  locked?: boolean
  /**
   * Typed into the box once (via the same fill animation Tab-to-autocomplete
   * uses), never submitted — the visitor reviews or edits it and sends it
   * themselves. For a deep link that wants to suggest a starting point
   * without speaking on the visitor's behalf.
   */
  deepLinkFill?: string
  /**
   * Seeds the URL picker once (e.g. the benchmark/pages "Ask Omni" links —
   * see llms-txt-menu.tsx / pages-detail-view.tsx). Consumed the same
   * one-shot way as `deepLinkFill`: shown as chips, never auto-submitted.
   */
  deepLinkSourceUrls?: string[]
}

export function SearchHome({ onSearch, isAutoDetecting = false, onToggleSidebar, onNewChat, isMobile = false, model = DEFAULT_MODEL, onModelChange, locked = false, deepLinkFill, deepLinkSourceUrls }: SearchHomeProps) {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [threadId, setThreadId] = useState<string>('')
  // Mirror in a ref so async handlers & closures always read the latest value
  // without depending on React state flush timing
  const threadIdRef = useRef<string>('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSstPending, setIsSstPending] = useState(false)
  const [sstPrompt, setSstPrompt] = useState('')
  const { isSignedIn } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const firstName = user?.firstName ?? null
  const clerk = useClerk()

  // The name the headline greets, or null when signed out / unavailable.
  // Cached rather than read straight off Clerk because `user` is null for the
  // first paint: without the cache a returning user watches the generic
  // headline render and then swap to their own, on every single load.
  const [heroName, setHeroName] = useState<string | null>(null)
  // Chosen in the mount effect below, never in the initializer: this
  // component is server-rendered, and a Math.random() there would disagree
  // with the client's and trip a hydration mismatch.
  const [headlineIndex, setHeadlineIndex] = useState(0)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [suggestionVisible, setSuggestionVisible] = useState(true)
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fillAnim, setFillAnim] = useState<{ text: string; submit: boolean } | null>(null)
  const fillAnimRef = useRef<{ text: string; submit: boolean } | null>(null)
  const fillDivRef = useRef<HTMLDivElement>(null)
  const fillRafRef = useRef<number | null>(null)

  useEffect(() => {
    setHeadlineIndex(Math.floor(Math.random() * SIGNED_IN_HEADLINES.length))
    try {
      const cached = localStorage.getItem('omni_hero_name')
      if (cached) setHeroName(cached)
    } catch {}
  }, [])

  useEffect(() => {
    if (!userLoaded) return
    // Long names are dropped rather than truncated: the name is the first
    // word of a display-serif headline, and "Bartholomew-Christop, what do
    // you want to know?" is worse than no name at all.
    if (!firstName || firstName.length > 12) {
      try { localStorage.removeItem('omni_hero_name') } catch {}
      setHeroName(null)
      return
    }
    try { localStorage.setItem('omni_hero_name', firstName) } catch {}
    setHeroName(firstName)
  }, [firstName, userLoaded])

  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionVisible(false)
      suggestionTimeoutRef.current = setTimeout(() => {
        setSuggestionIndex(prev => (prev + 1) % SUGGESTED_QUERIES.length)
        setSuggestionVisible(true)
      }, 400)
    }, 5000)
    return () => {
      clearInterval(interval)
      if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current)
    }
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const skillPickerRef = useRef<HTMLDivElement>(null)

  const { attachedFiles, uploadFile, removeFile, clearFiles } = useFileUpload()
  const { sourceUrls, addUrls, removeUrl, clearUrls } = useSourceUrls()
  const sourceUrlsCountRef = useRef(0)
  sourceUrlsCountRef.current = sourceUrls.length

  // Auto-detect sweetener: a URL pasted or typed into the query box is queued
  // into source_url on its own, text left untouched — see hooks/useSourceUrls.ts
  // for the detection rules. Reads the live count via a ref (not the
  // `sourceUrls` closure) so rapid paste+type in the same tick can't both
  // read a stale pre-add count and blow past the cap.
  const autoDetectUrls = useCallback((candidates: string[]) => {
    if (candidates.length === 0) return
    if (sourceUrlsCountRef.current >= MAX_SOURCE_URLS) {
      toast.error(`You can only add up to ${MAX_SOURCE_URLS} sources per message.`)
      return
    }
    sourceUrlsCountRef.current += candidates.length
    addUrls(candidates)
  }, [addUrls])

  const [activeSkill, setActiveSkill] = useState<SkillId | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [addUrlOpen, setAddUrlOpen] = useState(false)
  const [awaitingSkill, setAwaitingSkill] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const vadRafRef = useRef<number | null>(null)
  const speechDetectedRef = useRef(false)
  const voicedFramesRef = useRef(0)
  const silenceDurationRef = useRef(0)
  const lastVadTsRef = useRef<number | null>(null)
  const recordingStartTsRef = useRef(0)
  const sstPromptRef = useRef('')
  const sstPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopReasonRef = useRef<'manual' | 'initial-silence' | 'trailing-silence' | 'max-duration' | 'unknown'>('unknown')

  // Mouse glow state — we track both "target" (instant mouse) and "rendered" (smoothed)
  const glowRef = useRef<HTMLDivElement>(null)
  const mousePos = useRef({ x: 0, y: 0 })
  const renderedPos = useRef({ x: 0, y: 0 })
  const rafId = useRef<number>(0)

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const animateGlow = useCallback(() => {
    renderedPos.current.x = lerp(renderedPos.current.x, mousePos.current.x, 0.08)
    renderedPos.current.y = lerp(renderedPos.current.y, mousePos.current.y, 0.08)

    if (glowRef.current) {
      glowRef.current.style.transform = `translate(${renderedPos.current.x}px, ${renderedPos.current.y}px) translate(-50%, -50%)`
    }

    rafId.current = requestAnimationFrame(animateGlow)
  }, [])

  useEffect(() => {
    if (!plusMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false)
        setAddUrlOpen(false)
        setAwaitingSkill(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [plusMenuOpen])

  useEffect(() => {
    setSuggestionIndex(0)
    setSuggestionVisible(true)
  }, [activeSkill, awaitingSkill])

  useEffect(() => {
    if (!awaitingSkill) return
    const onMouse = (e: MouseEvent) => {
      if (skillPickerRef.current && !skillPickerRef.current.contains(e.target as Node)) {
        setAwaitingSkill(false)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAwaitingSkill(false) }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown', onKey)
    }
  }, [awaitingSkill])

  useEffect(() => {
    // Init glow position to center
    if (typeof window !== 'undefined') {
      mousePos.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      renderedPos.current = { ...mousePos.current }
    }

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }
    }

    window.addEventListener('mousemove', handleMouseMove)
    rafId.current = requestAnimationFrame(animateGlow)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(rafId.current)
    }
  }, [animateGlow])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 600)

    // Prevent default browser behavior for drag and drop globally
    // so if user drops file outside the box, it doesn't open the file in the current tab
    const preventDefault = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    // Attach to document to ensure we catch everything during any HMR states
    document.addEventListener('dragenter', preventDefault, false)
    document.addEventListener('dragover', preventDefault, false)
    document.addEventListener('dragleave', preventDefault, false)
    document.addEventListener('drop', preventDefault, false)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('dragenter', preventDefault, false)
      document.removeEventListener('dragover', preventDefault, false)
      document.removeEventListener('dragleave', preventDefault, false)
      document.removeEventListener('drop', preventDefault, false)
    }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    if (modelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelDropdownOpen])

  const { fetchWithAuth } = useApi()

  // Always write both state (for re-render) and ref (for sync closure access)
  const applyThreadId = useCallback((id: string) => {
    threadIdRef.current = id
    setThreadId(id)
  }, [])

  const createLocalFallbackThreadId = useCallback(() => {
    const fallbackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    applyThreadId(fallbackId)
    return fallbackId
  }, [applyThreadId])

  const fetchThreadId = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
      const mockId = 'mock-thread-id-' + Date.now()
      applyThreadId(mockId)
      return mockId
    }

    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    const endpoint = `${backendUrl}/get_thread_id`

    try {
      const res = await fetchWithAuth(endpoint)
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data === 'string') {
          applyThreadId(data)
          return data as string
        }
        if (data && data.thread_id) {
          applyThreadId(data.thread_id)
          return data.thread_id as string
        }
      }
    } catch (e) {
      console.error('Failed to fetch thread ID', e)
    }
    return null
  }, [fetchWithAuth, applyThreadId])

  // Fire-and-forget backend warm-up ping. Never blocks the UI and we don't
  // care about the result — it just wakes a cold backend a little earlier.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') return

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
      ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/health`
      : '/api/health'

    void fetch(backendUrl).catch(() => {})
  }, [])

  // NOTE: We intentionally do NOT pre-fetch thread_id here.
  // Pre-fetching caused empty threads to be created on the backend before
  // the user typed anything, which led to "Untitled Chat" ghosts in the sidebar.
  // thread_id is fetched on-demand in handleSubmit / handleFileSelect / onDrop.


  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      // Reset height to auto to correctly calculate shrink
      inputRef.current.style.height = 'auto'
      const newHeight = inputRef.current.scrollHeight
      // Max height ~ 200px (more expansion)
      const maxHeight = 200

      inputRef.current.style.height = `${Math.min(newHeight, maxHeight)}px`
      inputRef.current.style.overflowY = newHeight > maxHeight ? 'auto' : 'hidden'
    }
  }, [query])

  const handleFillEnd = useCallback(async () => {
    const current = fillAnimRef.current
    if (!current) return
    fillAnimRef.current = null
    setFillAnim(null)

    if (!current.submit) {
      setQuery(current.text)
      inputRef.current?.focus()
      return
    }

    const activeThreadId = threadIdRef.current || threadId || await fetchThreadId() || createLocalFallbackThreadId()
    if (!activeThreadId) return
    console.log('[SearchHome] handleFillEnd submit — thread_id:', activeThreadId)
    onSearch(current.text, activeThreadId)
    setQuery('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [threadId, fetchThreadId, createLocalFallbackThreadId, onSearch])

  const triggerFillAnimation = useCallback((text: string, submit: boolean) => {
    const payload = { text, submit }
    fillAnimRef.current = payload
    setFillAnim(payload)

    // Cancel any in-flight animation
    if (fillRafRef.current !== null) {
      cancelAnimationFrame(fillRafRef.current)
      fillRafRef.current = null
    }

    // Wait one frame for React to mount the overlay div, then start the rAF loop
    requestAnimationFrame(() => {
      const duration = 520
      const start = performance.now()

      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        // cubic ease-in-out
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        const p = eased * 100
        const shimW = 18 // shimmer zone width in %

        if (fillDivRef.current) {
          fillDivRef.current.style.backgroundImage = [
            'linear-gradient(90deg,',
            `  var(--foreground) ${Math.max(0, p - shimW)}%,`,
            `  rgb(32,178,170) ${p}%,`,
            `  transparent ${Math.min(100, p + shimW)}%`,
            ')',
          ].join('')
        }

        if (t < 1) {
          fillRafRef.current = requestAnimationFrame(tick)
        } else {
          fillRafRef.current = null
          void handleFillEnd()
        }
      }

      fillRafRef.current = requestAnimationFrame(tick)
    })
  }, [handleFillEnd])

  // Runs the same fill animation a deep link's `?fill=` value that a real
  // suggestion click would — typed into the box, focused, left unsent. The
  // ref guards against firing twice for one incoming value: the parent's own
  // effect that produced `deepLinkFill` only runs once, but this component
  // can still re-render for unrelated reasons while that prop stays set.
  const consumedFillRef = useRef<string | null>(null)
  useEffect(() => {
    if (!deepLinkFill || consumedFillRef.current === deepLinkFill) return
    consumedFillRef.current = deepLinkFill
    triggerFillAnimation(deepLinkFill, false)
  }, [deepLinkFill, triggerFillAnimation])

  // Same one-shot guard as `deepLinkFill` above, so re-renders while the prop
  // stays set don't re-add the same URLs.
  const consumedSourceUrlsRef = useRef<string[] | null>(null)
  useEffect(() => {
    if (!deepLinkSourceUrls?.length || consumedSourceUrlsRef.current === deepLinkSourceUrls) return
    consumedSourceUrlsRef.current = deepLinkSourceUrls
    addUrls(deepLinkSourceUrls)
  }, [deepLinkSourceUrls, addUrls])

  const getActiveSuggestion = () => {
    const arr = activeSkill ? SKILL_PLACEHOLDERS[activeSkill] : SUGGESTED_QUERIES
    return arr[suggestionIndex % arr.length]
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (attachedFiles.some((f) => f.status === 'uploading')) {
      toast.info('Please wait for the file to finish uploading.')
      return
    }

    const showingSuggestion = !query && !isRecording && !sstPrompt

    // Trigger fill animation for suggestion submit; handleFillEnd will do the actual search
    if (showingSuggestion && attachedFiles.length === 0 && sourceUrls.length === 0) {
      triggerFillAnimation(getActiveSuggestion(), true)
      return
    }

    // Read from ref first (always the latest, avoids stale-closure reads from state)
    const activeThreadId = threadIdRef.current || threadId || await fetchThreadId() || createLocalFallbackThreadId()
    if (!activeThreadId) return

    console.log('[SearchHome] handleSubmit — thread_id being sent to chat:', activeThreadId)

    // Filter out files that are not ready
    const readyFileIds = attachedFiles.filter((f) => f.status === 'ready').map((f) => f.id)
    const readyFileMeta = attachedFiles.filter((f) => f.status === 'ready').map((f) => ({ id: f.id, name: f.name, type: f.type }))
    const effectiveQuery = query.trim() || (
      readyFileMeta.length > 1 ? 'Please read these files'
      : readyFileMeta.length === 1 ? 'Please read this file'
      : sourceUrls.length > 1 ? 'Please read these sources'
      : sourceUrls.length === 1 ? 'Please read this source'
      : ''
    )

    if (effectiveQuery || attachedFiles.length > 0 || sourceUrls.length > 0) {
      if (readyFileIds.length > 0) {
        console.log('[SearchHome] handleSubmit — attached_file_ids:', readyFileIds)
      }
      const submittedSourceUrls = sourceUrls.map((e) => e.url)
      onSearch(effectiveQuery, activeThreadId, readyFileIds.length > 0 ? readyFileIds : undefined, readyFileMeta.length > 0 ? readyFileMeta : undefined, activeSkill || undefined, submittedSourceUrls.length > 0 ? submittedSourceUrls : undefined)
      clearFiles()
      clearUrls()
      setActiveSkill(null)
      setQuery('')
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (awaitingSkill && e.key === 'Enter') {
      const filter = query.startsWith('/') ? query.slice(1).toLowerCase().trim() : ''
      const matches = SKILLS.filter(s => !filter || s.label.toLowerCase().includes(filter) || s.id.includes(filter))
      if (matches.length > 0) {
        e.preventDefault()
        setActiveSkill(matches[0].id)
        setAwaitingSkill(false)
        setQuery('')
        return
      }
    }
    if (e.key === 'Tab' && !query && !isRecording && !sstPrompt) {
      e.preventDefault()
      triggerFillAnimation(getActiveSuggestion(), false)
      return
    }
    if (!shouldSubmitOnEnter(e, { isMenuOpen: modelDropdownOpen })) return
    e.preventDefault()
    void handleSubmit(e as unknown as React.FormEvent)
  }

  // Image attachments are refused by Omni SFT (served text-only). Blocked at
  // the picker below rather than at send time, so the user finds out before
  // they have uploaded anything — the backend rejects it again regardless.
  const acceptsImages = getModel(model).acceptsImages

  const VAD_RMS_THRESHOLD = 0.02
  const VAD_MIN_VOICED_FRAMES = 3
  const VAD_AUTO_STOP_ON_SILENCE_MS = 900
  const VAD_NUDGE_NO_SPEECH_MS = 5000
  const VAD_FORCE_STOP_NO_SPEECH_MS = 10000
  const VAD_MAX_RECORDING_MS = 60000

  const updateSstPrompt = useCallback((nextPrompt: string) => {
    if (sstPromptRef.current === nextPrompt) return
    sstPromptRef.current = nextPrompt
    setSstPrompt(nextPrompt)
  }, [])

  const clearSstPromptTimer = useCallback(() => {
    if (sstPromptTimeoutRef.current) {
      clearTimeout(sstPromptTimeoutRef.current)
      sstPromptTimeoutRef.current = null
    }
  }, [])

  const showSstPromptForDuration = useCallback((message: string, durationMs: number) => {
    clearSstPromptTimer()
    updateSstPrompt(message)
    sstPromptTimeoutRef.current = setTimeout(() => {
      updateSstPrompt('')
      sstPromptTimeoutRef.current = null
    }, durationMs)
  }, [clearSstPromptTimer, updateSstPrompt])

  const stopVadMonitoring = useCallback(() => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current)
      vadRafRef.current = null
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined)
      audioContextRef.current = null
    }
    silenceDurationRef.current = 0
    lastVadTsRef.current = null
  }, [])

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }, [])

  const startVadMonitoring = useCallback((stream: MediaStream) => {
    try {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.85
      source.connect(analyser)

      audioContextRef.current = audioContext
      speechDetectedRef.current = false
      voicedFramesRef.current = 0
      silenceDurationRef.current = 0
      lastVadTsRef.current = null

      const data = new Uint8Array(analyser.fftSize)

      const monitor = (ts: number) => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / data.length)

        const prevTs = lastVadTsRef.current ?? ts
        const delta = ts - prevTs
        lastVadTsRef.current = ts

        if (rms > VAD_RMS_THRESHOLD) {
          voicedFramesRef.current += 1
          silenceDurationRef.current = 0
          if (voicedFramesRef.current >= VAD_MIN_VOICED_FRAMES) {
            speechDetectedRef.current = true
          }
        } else if (speechDetectedRef.current) {
          silenceDurationRef.current += delta
        }

        const elapsed = ts - recordingStartTsRef.current
        if (!speechDetectedRef.current) {
          if (elapsed >= VAD_NUDGE_NO_SPEECH_MS) {
            updateSstPrompt('are you speaking?')
          } else {
            updateSstPrompt('listening...')
          }
        } else {
          updateSstPrompt('listening...')
        }

        const shouldStopForInitialSilence = !speechDetectedRef.current && elapsed >= VAD_FORCE_STOP_NO_SPEECH_MS
        const shouldStopForTrailingSilence = speechDetectedRef.current && silenceDurationRef.current >= VAD_AUTO_STOP_ON_SILENCE_MS
        const shouldStopForMaxDuration = elapsed >= VAD_MAX_RECORDING_MS

        if (shouldStopForInitialSilence || shouldStopForTrailingSilence || shouldStopForMaxDuration) {
          if (shouldStopForInitialSilence) {
            stopReasonRef.current = 'initial-silence'
          } else if (shouldStopForTrailingSilence) {
            stopReasonRef.current = 'trailing-silence'
          } else {
            stopReasonRef.current = 'max-duration'
          }
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
          }
          return
        }

        vadRafRef.current = requestAnimationFrame(monitor)
      }

      vadRafRef.current = requestAnimationFrame(monitor)
    } catch (error) {
      console.error('VAD init failed', error)
      speechDetectedRef.current = true
    }
  }, [updateSstPrompt])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      clearSstPromptTimer()
      stopVadMonitoring()
      stopMediaTracks()
      if (fillRafRef.current !== null) cancelAnimationFrame(fillRafRef.current)
    }
  }, [clearSstPromptTimer, stopMediaTracks, stopVadMonitoring])

  const resolveSstText = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return ''
    const data = payload as Record<string, unknown>
    const direct = data.text ?? data.transcript ?? data.result
    if (typeof direct === 'string') return direct.trim()
    if (data.data && typeof data.data === 'object') {
      const nested = data.data as Record<string, unknown>
      const nestedText = nested.text ?? nested.transcript ?? nested.result
      if (typeof nestedText === 'string') return nestedText.trim()
    }
    return ''
  }

  const stopRecording = () => {
    stopReasonRef.current = 'manual'
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const handleSst = async () => {
    if (isSstPending) return

    if (isRecording) {
      stopRecording()
      return
    }

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []
      speechDetectedRef.current = false
      voicedFramesRef.current = 0
      recordingStartTsRef.current = performance.now()
      stopReasonRef.current = 'unknown'
      clearSstPromptTimer()
      updateSstPrompt('listening...')

      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const selectedMimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type))
      const mediaRecorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      startVadMonitoring(stream)

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        stopVadMonitoring()
        stopMediaTracks()

        if (!speechDetectedRef.current) {
          if (stopReasonRef.current === 'initial-silence') {
            showSstPromptForDuration('No audio detected. Check microphone permissions or retry.', 5000)
          } else {
            updateSstPrompt('')
          }
          audioChunksRef.current = []
          return
        }

        if (!audioChunksRef.current.length) return

        const recorderType = mediaRecorder.mimeType || selectedMimeType || 'audio/webm'
        const extension = recorderType.includes('mp4') ? 'm4a' : 'webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: recorderType })
        const audioFile = new File([audioBlob], `speech-${Date.now()}.${extension}`, { type: recorderType })
        const formData = new FormData()
        formData.append('file', audioFile)

        const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
        const endpoint = `${backendUrl}/api/sst`

        setIsSstPending(true)
        try {
          const res = await fetchWithAuth(endpoint, {
            method: 'POST',
            body: formData,
          })
          if (!res.ok) return

          const contentType = res.headers.get('content-type') || ''
          let text = ''
          if (contentType.includes('application/json')) {
            const payload = await res.json()
            text = resolveSstText(payload)
          } else {
            text = (await res.text()).trim()
          }

          if (!text) return

          setQuery(text)
          inputRef.current?.focus()
        } catch (error) {
          console.error('SST failed', error)
        } finally {
          setIsSstPending(false)
          audioChunksRef.current = []
          updateSstPrompt('')
        }
      }

      mediaRecorder.start()
    } catch (error) {
      setIsRecording(false)
      stopVadMonitoring()
      stopMediaTracks()
      updateSstPrompt('')
      console.error('Failed to start SST recording', error)
    }
  }

  // Shared validation + upload path for file-picker, drag-drop, and paste.
  const uploadFilesFromList = useCallback((fileList: FileList | File[]) => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    const files = Array.from(fileList)
    if (files.length === 0) return

    if (attachedFiles.length + files.length > 5) {
      toast.error('You can only attach up to 5 files per message.')
      return
    }

    const processFiles = async () => {
      const activeThreadId = threadIdRef.current || threadId || await fetchThreadId() || createLocalFallbackThreadId()
      files.forEach(file => {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is too large. Maximum size is 20MB.`)
          return
        }
        if (!isAllowedUploadFile(file)) {
          toast.error(`${file.name} is not a supported file type.`)
          return
        }
        // Documents are fine on every model — only images are refused, and only
        // by Omni SFT. Checked here rather than at send time so nothing is
        // uploaded that the chosen model could never read.
        if (!acceptsImages && file.type.startsWith('image/')) {
          toast.error(IMAGE_UNSUPPORTED_MESSAGE)
          return
        }
        uploadFile(file, activeThreadId).catch(err => console.error('Failed to upload file in UI', err))
      })
    }
    processFiles()
  }, [isSignedIn, clerk, uploadFile, threadId, fetchThreadId, createLocalFallbackThreadId, attachedFiles.length, acceptsImages])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) uploadFilesFromList(files)
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const onUploadClick = () => {
    if (!isSignedIn) {
      clerk.openSignIn()
      return
    }
    fileInputRef.current?.click()
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    uploadFilesFromList(e.dataTransfer.files)
  }, [uploadFilesFromList])

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files
    if (files && files.length > 0) {
      e.preventDefault()
      uploadFilesFromList(files)
      return
    }
    const text = e.clipboardData?.getData('text')
    if (text) autoDetectUrls(extractUrls(text))
  }, [uploadFilesFromList, autoDetectUrls])

  return (
    <main className="relative h-full flex flex-col items-center justify-between px-4 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept={UPLOAD_ACCEPT_ATTR}
      />

      {/* Mobile header — no bar. This screen is already the blank slate a
          header would otherwise announce, so there's nothing for a bar or a
          logo to frame; two buttons floating over the hero are enough. */}
      <button
        onClick={onToggleSidebar}
        className="fixed top-3 left-3 z-40 p-2.5 rounded-full text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors md:hidden"
      >
        <Menu size={20} />
      </button>
      <button
        onClick={onNewChat}
        title="New thread"
        className="fixed top-3 right-3 z-40 p-2.5 rounded-full text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors md:hidden"
      >
        <Plus size={20} />
      </button>

      {/* Auto-detecting overlay */}
      {isAutoDetecting && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-500 fade-out duration-500">
          <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center">
                <div className="h-6 w-6 rounded-full border-[2px] border-[var(--accent)] border-t-transparent animate-spin opacity-80" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Selecting best model...</p>
              <p className="text-xs text-muted-foreground mt-1">Analyzing your query</p>
            </div>
          </div>
        </div>
      )}
      {/* ── Ambient field ────────────────────────────────────────────────
          Two out-of-frame washes drifting on long, offset cycles (22s and
          28s, one reversed) plus a slower teal bloom that follows the
          cursor. All three are far below the text in contrast — the point is
          that the empty half of a blank home screen is never quite still,
          not that anyone notices a gradient.

          The clipping wrapper is load-bearing, not decoration. These are
          deliberately positioned past the edges, and an absolutely positioned
          box that hangs off the BOTTOM of a scroll container still counts
          toward its scrollable area — so the lower wash was adding exactly
          its own 200px of overshoot to the page and letting the home screen
          scroll down past its own footer. `overflow-hidden` here contains
          them; `inset-0` keeps them pinned to the visible frame. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="omni-drift absolute -top-[180px] -right-[140px] h-[620px] w-[620px] rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--teal) 13%, transparent), transparent 68%)' }}
        />
        <div
          className="omni-drift-slow absolute -bottom-[200px] -left-[120px] h-[520px] w-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle at 60% 50%, color-mix(in srgb, var(--rust) 12%, transparent), transparent 68%)' }}
        />
      </div>
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-0 will-change-transform"
        style={{
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, color-mix(in srgb, var(--teal) 10%, transparent) 0%, color-mix(in srgb, var(--teal) 3%, transparent) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Two different jobs, one column. On desktop the hero and composer sit
          together in the middle of the page. On mobile the hero takes the
          slack instead, which pins the composer to the bottom of the
          viewport where the thumb already is — the composer is the only
          thing you came here to touch. */}
      <div className="flex w-full flex-1 flex-col md:justify-center">
        {/* Content — sits above the glow */}

        {/* ── Hero ────────────────────────────────────────────────────────
            One question, in the display serif, left-aligned to the composer so
            the headline and the input read as a single column rather than a
            centered banner sitting on top of a form.

            The copy is deliberately back to "curious about today" after a
            detour through "What do you want to know" — which reads better
            against the product's name, but is the line Perplexity runs today,
            and a landing headline that matches a competitor's word for word
            is worse than one that merely rhymes with it. `curious` takes the
            italic teal, the one piece of emphasis this screen gets.

            A signed-in name goes INTO the headline, not above it. It used to
            sit in a mono eyebrow — a second, smaller greeting stacked over
            the real one, which made the personal touch the least prominent
            thing on the page. See `SIGNED_IN_HEADLINES` for what replaces
            it. */}
        <div className="relative z-10 flex w-full flex-1 flex-col justify-center md:flex-none">
          <div className="animate-fade-up w-full max-w-[720px] mx-auto">
            <h1 className="omni-display omni-hero-headline text-[clamp(34px,11vw,46px)] md:text-[clamp(34px,5.2vw,62px)] text-[var(--ink)] mb-8 md:mb-9">
              {heroName ? (
                // No explicit line break here, unlike the signed-out line:
                // these vary in length and carry a name of unknown width, so
                // where they wrap has to be left to the measure.
                SIGNED_IN_HEADLINES[headlineIndex](heroName)
              ) : (
                <>
                  What are you<br />
                  <em>curious</em> about today?
                </>
              )}
            </h1>
          </div>
        </div>

        {/* Search Input Container */}
        <div className="w-full flex flex-col items-center relative z-10 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0 md:mt-0">
          {/* Sign-in prompt for MOBILE (above search) */}
          {isSignedIn === false && (
            <div className="md:hidden w-full max-w-[720px] flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2 mb-3">
              <span className="text-[11px] text-[var(--muted-foreground)] tracking-[0.01em]">
                10X usage and sync chats across devices for a smoother experience.
              </span>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="h-7 px-3 rounded-md border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors whitespace-nowrap"
                >
                  Sign In
                </button>
              </SignUpButton>
            </div>
          )}

          {/* Search Input */}
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[720px] animate-fade-up"
            style={{ animationDelay: '150ms' }}
          >
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                relative flex flex-col rounded-[28px] bg-[var(--paper-raised)] transition-all duration-300
                ${isFocused || isDragging
                  ? 'shadow-[0_0_0_1px_var(--teal),0_14px_40px_-28px_color-mix(in_srgb,var(--ink)_45%,transparent)]'
                  : 'shadow-[0_0_0_1px_var(--line-strong),0_14px_40px_-28px_color-mix(in_srgb,var(--ink)_35%,transparent)] hover:shadow-[0_0_0_1px_var(--line-strong),0_16px_44px_-26px_color-mix(in_srgb,var(--ink)_42%,transparent)]'
                }
              `}
            >
              {(attachedFiles.length > 0 || sourceUrls.length > 0) && (
                <div className="px-5 pt-4 pb-0 animate-in fade-in slide-in-from-top-1 duration-200 space-y-2">
                  <FileUploadArea files={attachedFiles} onRemove={removeFile} />
                  <SourceUrlArea urls={sourceUrls} onRemove={removeUrl} />
                </div>
              )}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={query}
                  onChange={(e) => {
                    const val = e.target.value
                    if (!awaitingSkill && val === '/' && !isMobile) {
                      setAwaitingSkill(true)
                      setQuery('/')
                      e.target.style.height = 'auto'
                      e.target.style.height = `${e.target.scrollHeight}px`
                      return
                    }
                    if (awaitingSkill) {
                      if (!val.startsWith('/')) {
                        setAwaitingSkill(false)
                      } else {
                        const filter = val.slice(1).toLowerCase().trim()
                        if (filter) {
                          const matches = SKILLS.filter(s => s.label.toLowerCase().includes(filter) || s.id.includes(filter))
                          if (matches.length === 0) setAwaitingSkill(false)
                        }
                      }
                    }
                    setQuery(val)
                    const completedUrl = lastCompletedUrlToken(val)
                    if (completedUrl) autoDetectUrls([completedUrl])
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={handleKeyDown}
                  onPaste={onPaste}
                  placeholder={(isRecording || !!sstPrompt) ? (sstPrompt || 'listening...') : ''}
                  className={`w-full resize-none bg-transparent px-6 ${attachedFiles.length > 0 ? 'pt-3 pb-2' : 'pt-[18px] pb-2'} text-[19px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none leading-[1.5] disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar max-h-[300px]`}
                  style={{ minHeight: '52px' }}
                />
                {fillAnim ? (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                    {/* Ghost base text */}
                    <div className={`absolute inset-0 px-6 ${attachedFiles.length > 0 ? 'pt-3' : 'pt-[18px]'} pb-2 text-[19px] leading-[1.5] text-[var(--ink-faint)]`}>
                      {fillAnim.text}
                    </div>
                    {/* Shimmer fill layer — background updated each rAF frame */}
                    <div
                      ref={fillDivRef}
                      className={`absolute inset-0 px-6 ${attachedFiles.length > 0 ? 'pt-3' : 'pt-[18px]'} pb-2 text-[19px] leading-[1.5]`}
                      style={{
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                      }}
                    >
                      {fillAnim.text}
                    </div>
                  </div>
                ) : !query && !isRecording && !sstPrompt && (attachedFiles.length > 0 || sourceUrls.length > 0) ? (
                  <div
                    className="absolute inset-0 pointer-events-none px-6 pt-3 pb-2 text-[19px] leading-[1.5] overflow-hidden"
                    aria-hidden="true"
                  >
                    <span className="text-[var(--ink-faint)]">
                      {attachedFiles.length > 1 ? 'Please read these files'
                        : attachedFiles.length === 1 ? 'Please read this file'
                        : sourceUrls.length > 1 ? 'Please read these sources'
                        : 'Please read this source'}
                    </span>
                  </div>
                ) : !query && !isRecording && !sstPrompt ? (() => {
                  const placeholders = activeSkill
                    ? SKILL_PLACEHOLDERS[activeSkill]
                    : SUGGESTED_QUERIES
                  return (
                    <div
                      className="absolute inset-0 pointer-events-none px-6 pt-[18px] pb-2 text-[19px] leading-[1.5] overflow-hidden"
                      aria-hidden="true"
                    >
                      <span
                        className="text-[var(--ink-faint)]"
                        style={{
                          opacity: suggestionVisible ? 1 : 0,
                          transition: 'opacity 0.4s ease-in-out',
                        }}
                      >
                        {placeholders[suggestionIndex % placeholders.length]}
                      </span>
                    </div>
                  )
                })() : null}
              </div>

              {/* Bottom bar — separate row, never overlaps text */}
              <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-1">
                {/* Left side: + menu + active skill pill */}
                <div ref={plusMenuRef} className="flex items-center gap-1.5">
                  {/* + button — intentionally not `relative`, so the dropdown anchors to the composer box below */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setPlusMenuOpen(p => !p)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--ink-muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)]"
                      aria-label="Add"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    {/* Desktop: dropdown spans the full composer width (anchored to the
                        `relative` composer box below via inset-x-0 — no fixed width, so it
                        can't shrink to a narrow floating card the way a hardcoded w-[280px]
                        used to). Mobile: full-width bottom sheet, same pattern as "Select Mode". */}
                    {plusMenuOpen && (() => {
                      const menuItems = addUrlOpen ? (
                        <AddUrlPopover
                          existingCount={sourceUrls.length}
                          onAdd={addUrls}
                          onClose={() => { setAddUrlOpen(false); setPlusMenuOpen(false) }}
                        />
                      ) : (
                        <>
                          {/* Add photos & files */}
                          <button
                            type="button"
                            onClick={() => { onUploadClick(); setPlusMenuOpen(false) }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--secondary)]/60 transition-colors rounded-lg"
                          >
                            <Paperclip className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[var(--foreground)]">Add photos & files</span>
                              <span className="block text-xs text-[var(--muted-foreground)]">Upload from computer</span>
                            </span>
                          </button>

                          {/* Add URL */}
                          <button
                            type="button"
                            onClick={() => setAddUrlOpen(true)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--secondary)]/60 transition-colors rounded-lg"
                          >
                            <Link2 className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-[var(--foreground)]">Add URL</span>
                              <span className="block text-xs text-[var(--muted-foreground)]">Pages Omni should prioritize reading</span>
                            </span>
                          </button>

                          {/* Divider */}
                          <div className="mx-3 my-1 border-t border-[var(--border)]" />

                          {/* Skills — available on every model. They used to be
                              Pro-only because the Fast profile was built with a
                              two-skill roster; there is one roster now and all
                              nine skills ship with it. */}
                          {SKILLS.map((skill) => {
                            const isActive = activeSkill === skill.id
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                onClick={() => { setActiveSkill(isActive ? null : skill.id); setPlusMenuOpen(false) }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg ${isActive ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--secondary)]/60'}`}
                              >
                                <skill.Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'}`} />
                                <span className="min-w-0 flex-1">
                                  <span className={`block text-sm font-medium ${isActive ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>{skill.label}</span>
                                  <span className="block text-xs text-[var(--muted-foreground)]">{skill.desc}</span>
                                </span>
                                {isActive && <Check className="h-4 w-4 text-[var(--accent)] shrink-0" />}
                              </button>
                            )
                          })}
                        </>
                      )

                      return (
                        <>
                          {/* Desktop dropdown */}
                          <div className={`hidden md:block absolute inset-x-0 top-full mt-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-100 ${addUrlOpen ? '' : 'py-2'}`}>
                            {menuItems}
                          </div>

                          {/* Mobile bottom sheet */}
                          <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
                            <div
                              className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm animate-in fade-in duration-200"
                              onClick={() => { setPlusMenuOpen(false); setAddUrlOpen(false) }}
                            />
                            <div className="relative bg-[var(--background)] border-t border-[var(--border)] rounded-t-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-full duration-300">
                              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--border)]" />
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-[var(--foreground)]">
                                  {addUrlOpen ? '' : 'Add to your message'}
                                </h3>
                                <button
                                  type="button"
                                  onClick={() => { setPlusMenuOpen(false); setAddUrlOpen(false) }}
                                  className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="flex flex-col gap-1">
                                {menuItems}
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Active skill pill */}
                  {activeSkill && (() => {
                    const skill = SKILLS.find(s => s.id === activeSkill)!
                    return (
                      <>
                        {/* Mobile: X + icon only */}
                        <button type="button" onClick={() => setActiveSkill(null)}
                          className="md:hidden flex items-center gap-1.5 rounded-full border border-foreground/25 px-2.5 py-1.5 text-[var(--muted-foreground)]"
                          aria-label="Remove skill">
                          <X className="h-3.5 w-3.5 shrink-0" />
                          <skill.Icon className="h-3.5 w-3.5 shrink-0" />
                        </button>
                        {/* Desktop: hover icon swap + name */}
                        <button type="button" onClick={() => setActiveSkill(null)}
                          className="hidden md:flex group items-center gap-1.5 rounded-full border border-foreground/25 px-3 py-1.5 text-[13px] font-medium text-[var(--muted-foreground)]"
                          aria-label="Remove skill">
                          <span className="relative h-3.5 w-3.5 shrink-0">
                            <skill.Icon className="absolute inset-0 h-3.5 w-3.5 transition-opacity group-hover:opacity-0" />
                            <X className="absolute inset-0 h-3.5 w-3.5 transition-opacity opacity-0 group-hover:opacity-100" />
                          </span>
                          <span>{skill.label}</span>
                        </button>
                      </>
                    )
                  })()}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <ModelPicker
                    model={model}
                    onChange={(m) => onModelChange?.(m)}
                    open={modelDropdownOpen}
                    setOpen={setModelDropdownOpen}
                    isSignedIn={!!isSignedIn}
                    locked={locked}
                    dropdownRef={dropdownRef}
                  />

                  <button
                    type="button"
                    onClick={handleSst}
                    disabled={isSstPending}
                    className={`
                      relative flex h-9 w-9 items-center justify-center rounded-full transition-colors
                      ${!isSstPending
                        ? isRecording
                          ? 'border border-transparent bg-[var(--teal)] text-[var(--accent-foreground)]'
                          : 'border border-[var(--line-strong)] text-[var(--ink-muted)] hover:border-[var(--teal)] hover:text-[var(--teal)]'
                        : 'border border-[var(--line)] text-[var(--ink-faint)] cursor-not-allowed'
                      }
                    `}
                    aria-label={isRecording ? 'Stop speech to text' : 'Start speech to text'}
                  >
                    {isRecording && !isSstPending && (
                      <span className="absolute inset-0 rounded-full border border-[var(--accent-foreground)]/35 animate-ping" aria-hidden="true" />
                    )}
                    {isSstPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />}
                  </button>

                  <button
                    type="submit"
                    disabled={(!!isRecording || !!sstPrompt) ? !query.trim() : false}
                    className="omni-send h-[38px] w-[38px]"
                    aria-label="Submit search"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* / skill picker */}
              {awaitingSkill && (() => {
                const filter = query.startsWith('/') ? query.slice(1).toLowerCase().trim() : ''
                const filtered = SKILLS.filter(s => !filter || s.label.toLowerCase().includes(filter) || s.id.includes(filter))
                if (filtered.length === 0) return null
                return (
                  <div
                    ref={skillPickerRef}
                    className="absolute top-full left-0 mt-2 w-[240px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
                  >
                    <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide">Skills</p>
                    {filtered.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => {
                          setActiveSkill(skill.id)
                          setAwaitingSkill(false)
                          setQuery('')
                          setTimeout(() => inputRef.current?.focus(), 0)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors rounded-lg mx-0"
                      >
                        <skill.Icon className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
                        {skill.label}
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </form>

          {/* Sign-in prompt for DESKTOP (below search) */}
          {isSignedIn === false && (
            <div className="hidden md:flex mt-3 w-full max-w-[720px] items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2">
              <span className="text-[11px] text-[var(--muted-foreground)] tracking-[0.01em]">
                10X usage and sync chats across devices for a smoother experience.
              </span>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="h-7 px-3 rounded-md border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors whitespace-nowrap"
                >
                  Sign In
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-6 hidden md:flex flex-col gap-4 justify-center items-center animate-fade-up" style={{ animationDelay: '500ms' }}>
        <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground/60">
          <p>
            &copy; {new Date().getFullYear()}{' '}
            <a href="https://omniknows.xyz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-foreground hover:text-foreground transition-colors font-[family-name:var(--font-plex)]">Omni Knows</a>
            {'. All rights reserved.'}
          </p>
          <p>
            Made with love by{' '}
            <a href="https://haozhe.li" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-muted-foreground/30 hover:decoration-foreground hover:text-foreground transition-colors">Haozhe Li</a>
          </p>
        </div>
      </footer>
    </main>
  )
}

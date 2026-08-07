'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, Menu, ChevronDown, Check, Lock, Mic, Loader2, X, Plus, Paperclip, Link2, Telescope, Plane, GraduationCap } from 'lucide-react'
import Image from 'next/image'
import { useApi } from '@/hooks/useApi'
import { SignUpButton, useAuth, useClerk, useUser } from '@clerk/nextjs'
import { shouldSubmitOnEnter } from '@/lib/keyboard'
import { useFileUpload } from '@/hooks/useFileUpload'
import { FileUploadArea } from '@/components/file-upload-area'
import { useSourceUrls } from '@/hooks/useSourceUrls'
import { SourceUrlArea } from '@/components/source-url-area'
import { AddUrlPopover } from '@/components/add-url-popover'

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
  isMobile?: boolean
  model?: 'fast' | 'pro'
  onModelChange?: (model: 'fast' | 'pro') => void
  /** Usage exhausted (guest-only) — locks both modes uniformly, no per-mode breakdown. */
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

export function SearchHome({ onSearch, isAutoDetecting = false, onToggleSidebar, isMobile = false, model = 'fast', onModelChange, locked = false, deepLinkFill, deepLinkSourceUrls }: SearchHomeProps) {
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

  const [greeting, setGreeting] = useState<string | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [suggestionVisible, setSuggestionVisible] = useState(true)
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [fillAnim, setFillAnim] = useState<{ text: string; submit: boolean } | null>(null)
  const fillAnimRef = useRef<{ text: string; submit: boolean } | null>(null)
  const fillDivRef = useRef<HTMLDivElement>(null)
  const fillRafRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      const cached = localStorage.getItem('omni_greeting')
      if (cached) setGreeting(cached)
    } catch {}
  }, [])

  useEffect(() => {
    if (!userLoaded) return
    if (!firstName || firstName.length > 10) {
      try { localStorage.removeItem('omni_greeting') } catch {}
      setGreeting(null)
      return
    }
    const options = [`Hey ${firstName}!`, `${firstName} returns!`]
    const chosen = options[Math.floor(Math.random() * options.length)]
    try { localStorage.setItem('omni_greeting', chosen) } catch {}
    setGreeting(chosen)
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

  const [backendStatus, setBackendStatus] = useState<'unknown' | 'ready' | 'not-ready'>('unknown')
  const [isCheckPending, setIsCheckPending] = useState(true)
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

  // Use refs for the interval ID to keep it accessible in cleanup
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Determine backend URL
    const backendUrl = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
      ? '/api/health'
      : process.env.NEXT_PUBLIC_BACKEND_URL
        ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/health`
        : '/api/health'

    if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
      setBackendStatus('ready')
      setIsCheckPending(false)
      return
    }

    const STORAGE_KEY = 'backend_health_status'
    const EXPIRY_KEY = 'backend_health_expiry'
    const EXPIRY_TIME = 10 * 60 * 1000 // 10 minutes

    const getStoredStatus = () => {
      if (typeof window === 'undefined') return null
      const status = localStorage.getItem(STORAGE_KEY)
      const expiry = localStorage.getItem(EXPIRY_KEY)
      if (status === 'ready' && expiry && parseInt(expiry) > Date.now()) {
        return 'ready'
      }
      return null
    }

    const setStoredStatus = () => {
      localStorage.setItem(STORAGE_KEY, 'ready')
      localStorage.setItem(EXPIRY_KEY, (Date.now() + EXPIRY_TIME).toString())
    }

    const checkHealth = async () => {
      try {
        const res = await fetch(backendUrl)
        if (res.ok) {
          setBackendStatus('ready')
          setIsCheckPending(false)
          setStoredStatus()
          // Stop polling if we become ready
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current)
            intervalIdRef.current = null
          }
        } else {
          setBackendStatus('not-ready')
          setIsCheckPending(false)
        }
      } catch (error) {
        setBackendStatus('not-ready')
        setIsCheckPending(false)
      }
    }

    // 1. Check local storage first
    const stored = getStoredStatus()
    if (stored === 'ready') {
      setBackendStatus('ready')
      setIsCheckPending(false)
    } else {
      // 2. If not stored/expired, check immediately
      checkHealth()
      // 3. And start polling every 5s
      intervalIdRef.current = setInterval(checkHealth, 5000)
    }

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current)
      }
    }
  }, [fetchThreadId])

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

    if (backendStatus !== 'ready') return
    const activeThreadId = threadIdRef.current || threadId || await fetchThreadId() || createLocalFallbackThreadId()
    if (!activeThreadId) return
    console.log('[SearchHome] handleFillEnd submit — thread_id:', activeThreadId)
    onSearch(current.text, activeThreadId)
    setQuery('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [backendStatus, threadId, fetchThreadId, createLocalFallbackThreadId, onSearch])

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
    if (backendStatus !== 'ready') return

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
    if (e.key === 'Tab' && !query && backendStatus === 'ready' && !isRecording && !sstPrompt) {
      e.preventDefault()
      triggerFillAnimation(getActiveSuggestion(), false)
      return
    }
    if (!shouldSubmitOnEnter(e, { isMenuOpen: modelDropdownOpen })) return
    e.preventDefault()
    void handleSubmit(e as unknown as React.FormEvent)
  }

  const selectedModelLabel = model === 'pro' ? 'Pro' : 'Fast'
  const showSelectedLock = locked

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
    if (backendStatus !== 'ready' || isSstPending) return

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
        const allowedTypes = [
          'application/pdf', 'text/plain', 'text/markdown', 'text/html', 'application/json',
          'application/xml', 'text/xml', 'application/yaml', 'application/x-yaml', 'text/yaml',
          'image/jpeg', 'image/png'
        ]
        const allowedExtensions = ['.md', '.py', '.js', '.jsx', '.ts', '.tsx', '.html', '.json', '.xml', '.yaml', '.yml', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.jpg', '.jpeg', '.png']

        const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
        const isAllowedType = allowedTypes.includes(file.type)
        const isAllowedExt = allowedExtensions.includes(fileExt)

        if (!isAllowedType && !isAllowedExt) {
          toast.error(`${file.name} is not a supported file type.`)
          return
        }
        uploadFile(file, activeThreadId).catch(err => console.error('Failed to upload file in UI', err))
      })
    }
    processFiles()
  }, [isSignedIn, clerk, uploadFile, threadId, fetchThreadId, createLocalFallbackThreadId, attachedFiles.length])

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
    }
  }, [uploadFilesFromList])

  return (
    <main className="relative h-full flex flex-col items-center justify-between px-4 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">
      {/* Hidden file input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.txt,.md,.py,.js,.jsx,.ts,.tsx,.html,.json,.xml,.yaml,.yml,.java,.c,.cpp,.h,.hpp,.sh,.jpg,.jpeg,.png,application/pdf,text/plain,text/markdown,text/html,application/json,application/xml,application/yaml,image/jpeg,image/png"
      />

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-center z-40 md:hidden">
        <button
          onClick={onToggleSidebar}
          className="absolute left-4 p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
        >
          <Menu size={20} />
        </button>
      </header>

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
      {/* Mouse-following glow — sits behind everything via z-0 */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-0 will-change-transform"
        style={{
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(32,178,170,0.12) 0%, rgba(32,178,170,0.04) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Spacer for centering content properly */}
      <div className="flex-1 w-full flex flex-col md:justify-center">
        {/* Content — sits above the glow */}

        {/* Brand */}
        <div className="flex-1 md:flex-none flex flex-col items-center justify-center relative z-10 w-full md:mb-12">
          <div className="animate-fade-up">
            <h1 className="flex items-center justify-center gap-3 text-[2.5rem] sm:text-5xl font-[450] tracking-tight text-foreground font-[family-name:var(--font-plex)]">
              <span className="relative block h-[1em] w-[1em] shrink-0">
                <Image
                  src="/omni-logo-light.png"
                  alt=""
                  fill
                  className="object-contain dark:hidden"
                />
                <Image
                  src="/omni-logo-dark.png"
                  alt=""
                  fill
                  className="object-contain hidden dark:block"
                />
              </span>
              {greeting ?? 'Meet Omni'}
            </h1>
          </div>
        </div>

        {/* Search Input Container */}
        <div className="w-full flex flex-col items-center relative z-10 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0 md:mt-0">
          {/* Sign-in prompt for MOBILE (above search) */}
          {isSignedIn === false && (
            <div className="md:hidden w-full max-w-[680px] flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2 mb-3">
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
            className="w-full max-w-[680px] animate-fade-up"
            style={{ animationDelay: '150ms' }}
          >
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                relative rounded-2xl transition-all duration-300 flex flex-col
                ${isFocused || isDragging
                  ? 'shadow-[0_0_0_1px_var(--accent),0_4px_24px_rgba(32,178,170,0.08)] bg-[var(--card)]'
                  : 'shadow-[0_0_0_1px_var(--border),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.06)] bg-card'
                }
                ${isDragging ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]' : ''}
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
                    if (!awaitingSkill && val === '/' && model === 'pro' && !isMobile) {
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
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={handleKeyDown}
                  onPaste={onPaste}
                  disabled={backendStatus !== 'ready' || isCheckPending}
                  placeholder={
                    (isRecording || !!sstPrompt)
                      ? (sstPrompt || 'listening...')
                      : backendStatus === 'ready'
                        ? ''
                        : isCheckPending
                          ? "Connecting to brain..."
                          : "Backend is not ready, please wait..."
                  }
                  className={`w-full resize-none bg-transparent px-6 ${attachedFiles.length > 0 ? 'pt-3 pb-2' : 'pt-5 pb-2'} text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar max-h-[300px]`}
                  style={{ minHeight: '52px' }}
                />
                {fillAnim ? (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                    {/* Ghost base text */}
                    <div className={`absolute inset-0 px-6 ${attachedFiles.length > 0 ? 'pt-3' : 'pt-5'} pb-2 text-base leading-relaxed text-[var(--muted-foreground)]/50`}>
                      {fillAnim.text}
                    </div>
                    {/* Shimmer fill layer — background updated each rAF frame */}
                    <div
                      ref={fillDivRef}
                      className={`absolute inset-0 px-6 ${attachedFiles.length > 0 ? 'pt-3' : 'pt-5'} pb-2 text-base leading-relaxed`}
                      style={{
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                      }}
                    >
                      {fillAnim.text}
                    </div>
                  </div>
                ) : !query && backendStatus === 'ready' && !isRecording && !sstPrompt && (attachedFiles.length > 0 || sourceUrls.length > 0) ? (
                  <div
                    className="absolute inset-0 pointer-events-none px-6 pt-3 pb-2 text-base leading-relaxed overflow-hidden"
                    aria-hidden="true"
                  >
                    <span className="text-[var(--muted-foreground)]/50">
                      {attachedFiles.length > 1 ? 'Please read these files'
                        : attachedFiles.length === 1 ? 'Please read this file'
                        : sourceUrls.length > 1 ? 'Please read these sources'
                        : 'Please read this source'}
                    </span>
                  </div>
                ) : !query && backendStatus === 'ready' && !isRecording && !sstPrompt ? (() => {
                  const placeholders = activeSkill
                    ? SKILL_PLACEHOLDERS[activeSkill]
                    : SUGGESTED_QUERIES
                  return (
                    <div
                      className="absolute inset-0 pointer-events-none px-6 pt-5 pb-2 text-base leading-relaxed overflow-hidden"
                      aria-hidden="true"
                    >
                      <span
                        className="text-[var(--muted-foreground)]/50"
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
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                {/* Left side: + menu + active skill pill */}
                <div ref={plusMenuRef} className="flex items-center gap-1.5">
                  {/* + button — intentionally not `relative`, so the dropdown anchors to the composer box below */}
                  <div>
                    <button
                      type="button"
                      onClick={() => { if (backendStatus === 'ready' && !isCheckPending) setPlusMenuOpen(p => !p) }}
                      disabled={backendStatus !== 'ready' || isCheckPending}
                      className={`
                        flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                        ${backendStatus === 'ready' && !isCheckPending
                          ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                        }
                      `}
                      aria-label="Add"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    {/* Dropdown expands downward on desktop (input sits near the top of the page) and
                        upward on mobile (input is pinned to the bottom of the viewport). */}
                    {plusMenuOpen && (
                      <div className={`absolute inset-x-0 bottom-full mb-2 md:bottom-auto md:top-full md:mb-0 md:mt-2 w-[280px] bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 md:slide-in-from-top-1 duration-100 ${addUrlOpen ? '' : 'py-2'}`}>
                      {addUrlOpen ? (
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

                        {/* Skills — Pro only */}
                        {SKILLS.map((skill) => {
                          const isActive = activeSkill === skill.id
                          if (model !== 'pro') {
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                title="Only available in Pro mode"
                                onClick={() => toast('Switch to Pro mode to use skills')}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-lg opacity-40 cursor-not-allowed"
                              >
                                <skill.Icon className="h-5 w-5 text-[var(--muted-foreground)] shrink-0" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-[var(--foreground)]">{skill.label}</span>
                                  <span className="block text-xs text-[var(--muted-foreground)]">Only available in Pro mode</span>
                                </span>
                                <Lock className="h-3.5 w-3.5 text-[var(--muted-foreground)] shrink-0" />
                              </button>
                            )
                          }
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
                      )}
                      </div>
                    )}
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
                  {/* Mode dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setModelDropdownOpen(prev => !prev)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors select-none"
                    >
                      <span>{selectedModelLabel}</span>
                      {showSelectedLock && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] leading-none">
                          Sign in
                        </span>
                      )}
                      {showSelectedLock && <Lock className="h-3 w-3" />}
                      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {modelDropdownOpen && (
                      <>
                        {/* Desktop Dropdown */}
                        <div className="hidden md:block absolute top-full right-0 mt-2 w-[280px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                          {[
                            { value: 'fast' as const, label: 'Fast', desc: 'All-around answers' },
                            { value: 'pro' as const, label: 'Pro', desc: 'In-depth analysis on complex topics' },
                          ].map((opt) => {
                            const isLocked = locked
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  onModelChange?.(opt.value)
                                  setModelDropdownOpen(false)
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--secondary)]/50 ${model === opt.value ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[14px] font-semibold leading-none">
                                      {opt.label}
                                    </span>
                                    {isLocked && <Lock className="h-3.5 w-3.5 opacity-60" />}
                                  </div>
                                  <div className="text-[11px] text-[var(--muted-foreground)] leading-snug line-clamp-2">
                                    {isLocked
                                      ? 'Usage limit reached — sign in for 10× more usage'
                                      : opt.desc}
                                  </div>
                                </div>
                                <div className="shrink-0 flex items-center justify-center w-5">
                                  {model === opt.value && (
                                    <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} />
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        {/* Mobile Modal/Drawer */}
                        <div className="md:hidden fixed inset-0 z-[100] flex flex-col justify-end">
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setModelDropdownOpen(false)} />
                          <div className="relative bg-[var(--background)] border-t border-[var(--border)] rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-full duration-300">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-base font-semibold text-[var(--foreground)]">Select Mode</h3>
                              <button
                                type="button"
                                onClick={() => setModelDropdownOpen(false)}
                                className="p-1.5 rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-2.5">
                              {[
                                { value: 'fast' as const, label: 'Fast', desc: 'All-around answers' },
                                { value: 'pro' as const, label: 'Pro', desc: 'In-depth analysis on complex topics' },
                              ].map((opt) => {
                                const isLocked = locked
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                      onModelChange?.(opt.value)
                                      setModelDropdownOpen(false)
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-left transition-colors bg-[var(--secondary)]/30 active:bg-[var(--secondary)]/60 ${model === opt.value ? 'ring-[1.5px] ring-[var(--accent)] text-[var(--accent)]' : 'border border-[var(--border-subtle)] text-[var(--foreground)]'}`}
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-[15px] font-medium flex items-center gap-1.5">
                                        {opt.label}
                                        {isLocked && <Lock className="h-3.5 w-3.5" />}
                                      </span>
                                      <span className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                                        {isLocked
                                          ? 'Usage limit reached — sign in for 10× more'
                                          : opt.desc}
                                      </span>
                                    </div>
                                    <div className="ml-3 shrink-0 flex items-center gap-2">
                                      {model === opt.value ? (
                                        <div className="h-5 w-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-white">
                                          <Check className="h-3.5 w-3.5" />
                                        </div>
                                      ) : (
                                        <div className="h-5 w-5 rounded-full border border-[var(--border)]" />
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSst}
                    disabled={backendStatus !== 'ready' || isSstPending || isCheckPending}
                    className={`
                      relative flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                      ${backendStatus === 'ready' && !isSstPending
                        ? isRecording
                          ? 'bg-accent text-accent-foreground hover:opacity-90 shadow-[0_0_0_1px_var(--accent)]'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
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
                    disabled={backendStatus !== 'ready' || (!!isRecording || !!sstPrompt ? !query.trim() : false)}
                    className={`
                    flex items-center justify-center h-9 w-9 rounded-full transition-all duration-200
                    ${backendStatus === 'ready' && !isRecording && !sstPrompt
                        ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer'
                        : query.trim() && backendStatus === 'ready'
                          ? 'bg-accent text-accent-foreground hover:opacity-90 cursor-pointer'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }
                  `}
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
            <div className="hidden md:flex mt-3 w-full max-w-[680px] items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2">
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

      {/* Footer Status */}
      <footer className="w-full py-6 hidden md:flex flex-col gap-4 justify-center items-center animate-fade-up" style={{ animationDelay: '500ms' }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full backdrop-blur-sm border border-border/50">
          <div className={`w-2 h-2 rounded-full ${backendStatus === 'ready' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
            backendStatus === 'not-ready' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' :
              'bg-gray-400'
            }`} />
          <span>
            {backendStatus === 'ready' ? 'System Operational' :
              backendStatus === 'not-ready' ? 'System Offline / Starting' :
                'Connecting...'}
          </span>
        </div>

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

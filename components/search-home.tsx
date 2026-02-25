'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowRight, Sparkles, Menu, ChevronDown, Check, Lock, Mic, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/useApi'
import { SignUpButton, useAuth } from '@clerk/nextjs'
import { shouldSubmitOnEnter } from '@/lib/keyboard'

interface SearchHomeProps {
  onSearch: (query: string, threadId: string) => void
  isAutoDetecting?: boolean
  onToggleSidebar?: () => void
  isMobile?: boolean
  model?: 'auto' | 'canvas' | 'light'
  onModelChange?: (model: 'auto' | 'canvas' | 'light') => void
  quotaExceeded?: boolean
  remainingQuota?: number | null
}

export function SearchHome({ onSearch, isAutoDetecting = false, onToggleSidebar, isMobile = false, model = 'auto', onModelChange, quotaExceeded = false, remainingQuota = null }: SearchHomeProps) {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [threadId, setThreadId] = useState<string>('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isSstPending, setIsSstPending] = useState(false)
  const [sstPrompt, setSstPrompt] = useState('')
  const { isSignedIn } = useAuth()
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
    return () => clearTimeout(timer)
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

  const createLocalFallbackThreadId = useCallback(() => {
    const fallbackId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    setThreadId(fallbackId)
    return fallbackId
  }, [])

  const fetchThreadId = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
      const mockId = 'mock-thread-id-' + Date.now()
      setThreadId(mockId)
      return mockId
    }

    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    const endpoint = `${backendUrl}/get_thread_id`

    try {
      const res = await fetchWithAuth(endpoint)
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data === 'string') {
          setThreadId(data)
          return data as string
        }
        if (data && data.thread_id) {
          setThreadId(data.thread_id)
          return data.thread_id as string
        }
      }
    } catch (e) {
      console.error('Failed to fetch thread ID', e)
    }
    return null
  }, [fetchWithAuth])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (backendStatus !== 'ready') return

    // Ensure threadId is present
    const activeThreadId = threadId || await fetchThreadId() || createLocalFallbackThreadId()
    if (!activeThreadId) return

    if (query.trim()) {
      onSearch(query.trim(), activeThreadId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitOnEnter(e, { isMenuOpen: modelDropdownOpen })) return
    e.preventDefault()
    void handleSubmit(e as unknown as React.FormEvent)
  }

  const selectedModelLabel = model === 'auto' ? 'Auto' : model === 'canvas' ? 'Canvas' : 'Light'
  const showCanvasRemaining = model === 'canvas' && !quotaExceeded && remainingQuota !== null
  const showSelectedLock = quotaExceeded && (model === 'canvas' || model === 'auto')

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

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-between px-4 overflow-y-auto overflow-x-hidden pt-14 md:pt-0">

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
      <div className="flex-1 w-full flex flex-col items-center justify-center">
        {/* Content — sits above the glow */}
        <div className="relative z-10 flex flex-col items-center w-full">
          {/* Brand */}
          <div className="animate-fade-up mb-12 text-center">
            <h1 className="text-[2.5rem] sm:text-5xl font-light tracking-tight text-foreground lowercase font-[family-name:var(--font-plex)]">
              omni
              <span
                className="font-normal"
                style={{ color: '#20B2AA' }}
              >
                knows
              </span>
            </h1>
            <p className="mt-3 text-muted-foreground text-sm tracking-wide">
              Research anything. Get answers with sources.
            </p>
          </div>

          {/* Search Input */}
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[680px] animate-fade-up"
            style={{ animationDelay: '150ms' }}
          >
            <div
              className={`
                rounded-2xl bg-card transition-all duration-300 flex flex-col
                ${isFocused
                  ? 'shadow-[0_0_0_1px_var(--accent),0_4px_24px_rgba(32,178,170,0.08)]'
                  : 'shadow-[0_0_0_1px_var(--border),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_0_0_1px_var(--border),0_4px_16px_rgba(0,0,0,0.06)]'
                }
              `}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                disabled={backendStatus !== 'ready'}
                placeholder={
                  (isRecording || !!sstPrompt)
                    ? (sstPrompt || 'listening...')
                    : backendStatus === 'ready'
                      ? "Ask anything..."
                      : isCheckPending
                        ? "Connecting to brain..."
                        : "Backend is not ready, please wait..."
                }
                className={`w-full resize-none bg-transparent px-6 pt-5 pb-2 text-base text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar`}
                style={{ minHeight: '52px' }}
              />

              {/* Bottom bar — separate row, never overlaps text */}
              <div className="flex items-center justify-end gap-1.5 px-3 pb-3 pt-1">
                {/* Mode dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen(prev => !prev)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors select-none"
                  >
                    <span>{selectedModelLabel}</span>
                    {showCanvasRemaining && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] leading-none">
                        {remainingQuota} left
                      </span>
                    )}
                    {showSelectedLock && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)] leading-none">
                        Sign in
                      </span>
                    )}
                    {showSelectedLock && <Lock className="h-3 w-3" />}
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {modelDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-52 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      {[
                        { value: 'auto' as const, label: 'Auto', desc: 'Smart model selection' },
                        { value: 'canvas' as const, label: 'Canvas', desc: 'Deep research mode' },
                        { value: 'light' as const, label: 'Light', desc: 'Quick answers' },
                      ].map((opt) => {
                        const isCanvasOptionLocked = quotaExceeded && opt.value === 'canvas'
                        const isAutoOptionLocked = quotaExceeded && opt.value === 'auto'
                        const isLocked = isAutoOptionLocked || isCanvasOptionLocked
                        const showRemaining = opt.value === 'canvas' && !quotaExceeded && remainingQuota !== null
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              onModelChange?.(opt.value)
                              setModelDropdownOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--secondary)]/50 ${model === opt.value ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-[13px] font-medium flex items-center gap-1.5">
                                {opt.label}
                                {isLocked && <Lock className="h-3 w-3" />}
                              </span>
                              <span className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                                {isAutoOptionLocked || isCanvasOptionLocked
                                    ? 'Daily quota reached — sign in for unlimited'
                                    : opt.desc}
                              </span>
                            </div>
                            <div className="ml-2 w-[78px] flex items-center justify-end gap-2 shrink-0">
                              {showRemaining && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted-foreground)]">
                                  {remainingQuota} left
                                </span>
                              )}
                              {model === opt.value ? (
                                <Check className="h-4 w-4 text-[var(--accent)]" />
                              ) : (
                                <span className="h-4 w-4" aria-hidden="true" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSst}
                  disabled={backendStatus !== 'ready' || isSstPending}
                  className={`
                    relative flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-200
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
                    <span className="absolute inset-0 rounded-xl border border-[var(--accent-foreground)]/35 animate-ping" aria-hidden="true" />
                  )}
                  {isSstPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />}
                </button>

                <button
                  type="submit"
                  disabled={!query.trim() || backendStatus !== 'ready'}
                  className={`
                    flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-200
                    ${query.trim() && backendStatus === 'ready'
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
          </form>

          {isSignedIn === false && (
            <div className="mt-3 w-full max-w-[680px] flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--secondary)]/20 px-3 py-2">
              <span className="text-[11px] text-[var(--muted-foreground)] tracking-[0.01em]">
                Unlimited usage and sync chats across devices for a smoother experience.
              </span>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="h-7 px-3 rounded-md border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]/60 transition-colors whitespace-nowrap"
                >
                  Get Started
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>

      {/* Footer Status */}
      <footer className="w-full py-6 flex flex-col gap-4 justify-center items-center animate-fade-up" style={{ animationDelay: '500ms' }}>
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

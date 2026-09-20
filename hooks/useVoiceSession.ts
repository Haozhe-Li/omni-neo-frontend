'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { getOrCreateGuestId, useApi } from './useApi'
import { getLocalISOString } from '@/lib/utils'
import { getUserLocation } from '@/lib/location'

/**
 * Client for the backend's live voice agent (`/ws/voice`, see omni's
 * core/voice/session.py). Talks directly to the backend over a raw
 * WebSocket — unlike the rest of this app's /api/* routes, there is no
 * Next.js proxy in between, because a serverless route handler can't hold a
 * socket open for the life of a call. The wire protocol mirrors
 * core/static/voice_test.html exactly:
 *
 *   client -> server: binary frames, PCM16 mono @ 16kHz, sent continuously
 *   server -> client: binary frames = 8-byte header (turn_id, seq — both
 *                      uint32 big-endian) + PCM16 mono @ 24kHz
 *                      JSON text frames = control messages (see below)
 *
 * Turn detection and barge-in both live server-side (Deepgram's VAD): this
 * hook does not run its own voice-activity detection, it just streams
 * everything and reacts to the control messages that come back.
 *
 * Auth + thread_id match every other agent (see core/routers/voice.py):
 * `start()` mints a fresh thread_id from /get_thread_id (origin=voice, so it
 * stays out of the regular chat sidebar — same trick scheduled-task threads
 * use) every time a call starts, then opens the socket with identity +
 * thread_id in the URL's query string. One call = one thread — hanging up
 * always leads back to the home page (see voice-view.tsx's feedback flow),
 * so there's no "resume this same call" case to persist a thread_id for.
 * Query string, not a header, because a browser WebSocket handshake can't
 * carry a custom Authorization header the way fetch() can — this is the
 * standard workaround, and it's why getOrCreateGuestId/getToken are read
 * directly here instead of only going through useApi's fetchWithAuth.
 *
 * orbMode transitions are driven ONLY by discrete server events (turn_start
 * / agent_text / turn_end / clear), never by the raw audio level. An earlier
 * version also flipped speaking<->listening every animation frame based on
 * whether the agent's live playback level was above a fixed threshold — but
 * TTS audio has brief near-silent gaps between words/sentences, so that
 * fought the event-driven state and made the orb flicker between the two
 * modes throughout a single reply. runOrbLoop below still writes a smoothed
 * 0..1 level to the orb's `--orb-glow`/transform every frame for whichever
 * mode is current, purely for visual intensity — it never changes what mode
 * we're in.
 */

const SEND_SAMPLE_RATE = 16000
const PLAYBACK_SAMPLE_RATE = 24000
const VOICE_INPUT_CONSTRAINTS: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
}

export type VoiceTurn = {
    turnId: number
    userText: string
    agentText: string
    status: 'thinking' | 'speaking' | 'done' | 'interrupted' | 'error'
    errorDetail?: string
}

export type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
export type VoiceOrbMode = 'idle' | 'listening' | 'thinking' | 'speaking'

function wsUrlFor(path: string): string {
    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    return backend.replace(/^http/, 'ws') + path
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
    if (inputRate === SEND_SAMPLE_RATE) return input
    const ratio = inputRate / SEND_SAMPLE_RATE
    const newLen = Math.round(input.length / ratio)
    const out = new Float32Array(newLen)
    let offsetResult = 0
    let offsetBuf = 0
    while (offsetResult < newLen) {
        const nextOffsetBuf = Math.round((offsetResult + 1) * ratio)
        let sum = 0
        let count = 0
        for (let i = offsetBuf; i < nextOffsetBuf && i < input.length; i++) {
            sum += input[i]
            count++
        }
        out[offsetResult] = count ? sum / count : 0
        offsetResult++
        offsetBuf = nextOffsetBuf
    }
    return out
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buf = new ArrayBuffer(input.length * 2)
    const view = new DataView(buf)
    for (let i = 0, off = 0; i < input.length; i++, off += 2) {
        const s = Math.max(-1, Math.min(1, input[i]))
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true) // PCM16LE
    }
    return buf
}

function rms(input: Float32Array): number {
    let sum = 0
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
    return Math.sqrt(sum / (input.length || 1))
}

export function useVoiceSession(orbRef: React.RefObject<HTMLDivElement | null>) {
    const { getToken } = useAuth()
    const { fetchWithAuth } = useApi()
    const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle')
    const [orbMode, setOrbMode] = useState<VoiceOrbMode>('idle')
    const [muted, setMuted] = useState(false)
    // Only the most recent turn — this page shows a single live exchange,
    // not a scrolling transcript.
    const [currentTurn, setCurrentTurn] = useState<VoiceTurn | null>(null)
    const [liveTranscript, setLiveTranscript] = useState('')
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const wsRef = useRef<WebSocket | null>(null)
    const micStreamRef = useRef<MediaStream | null>(null)
    const micCtxRef = useRef<AudioContext | null>(null)
    const micNodeRef = useRef<ScriptProcessorNode | null>(null)
    const playCtxRef = useRef<AudioContext | null>(null)
    const playAnalyserRef = useRef<AnalyserNode | null>(null)
    const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([])
    const nextPlayTimeRef = useRef(0)
    const activeTurnIdRef = useRef(0)
    const userLevelRef = useRef(0)
    const smoothedLevelRef = useRef(0)
    const rafRef = useRef<number | null>(null)
    const modeRef = useRef<VoiceOrbMode>('idle')
    const mutedRef = useRef(false)
    const analyserBufRef = useRef<Uint8Array | null>(null)
    // The mic pipeline starts producing buffers as soon as getUserMedia
    // resolves — well before the WebSocket exists, let alone before the
    // backend has finished auth/thread checks and connected to Deepgram
    // (see core/voice/session.py's "ready" message). Anything captured
    // before that arrives gets queued here instead of dropped, so a user
    // who starts talking the instant the call connects doesn't lose the
    // first word.
    const readyRef = useRef(false)
    const pendingAudioRef = useRef<ArrayBuffer[]>([])
    // turn_end means the server is done GENERATING — it says nothing about
    // whether the client has finished PLAYING what already got sent. Audio
    // is scheduled ahead on the Web Audio timeline (see playPcm16's
    // nextPlayTimeRef math), so several seconds of it can still be queued
    // up when turn_end arrives. This timer defers the switch back to
    // 'listening' until that queued audio actually finishes playing, so
    // "Omni is speaking" doesn't disappear right as the reply starts being
    // heard.
    const speakingEndTimerRef = useRef<number | null>(null)

    const setMode = useCallback((mode: VoiceOrbMode) => {
        modeRef.current = mode
        setOrbMode(mode)
    }, [])

    const patchCurrentTurn = useCallback((turnId: number, patch: (t: VoiceTurn) => VoiceTurn) => {
        setCurrentTurn((prev) => (prev && prev.turnId === turnId ? patch(prev) : prev))
    }, [])

    const stopAllPlayback = useCallback(() => {
        for (const src of scheduledSourcesRef.current) {
            try {
                src.stop(0)
            } catch {
                // already finished
            }
        }
        scheduledSourcesRef.current = []
        if (playCtxRef.current) nextPlayTimeRef.current = playCtxRef.current.currentTime
    }, [])

    const playPcm16 = useCallback((turnId: number, bytes: Uint8Array) => {
        if (turnId !== activeTurnIdRef.current) return // stale audio from an interrupted turn
        const playCtx = playCtxRef.current
        const analyser = playAnalyserRef.current
        if (!playCtx || !analyser) return
        const sampleCount = bytes.byteLength / 2
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const float32 = new Float32Array(sampleCount)
        for (let i = 0; i < sampleCount; i++) float32[i] = view.getInt16(i * 2, true) / 0x8000
        const buffer = playCtx.createBuffer(1, sampleCount, PLAYBACK_SAMPLE_RATE)
        buffer.copyToChannel(float32, 0)
        const src = playCtx.createBufferSource()
        src.buffer = buffer
        src.connect(analyser)
        const startAt = Math.max(playCtx.currentTime, nextPlayTimeRef.current)
        src.start(startAt)
        nextPlayTimeRef.current = startAt + buffer.duration
        scheduledSourcesRef.current.push(src)
        src.onended = () => {
            scheduledSourcesRef.current = scheduledSourcesRef.current.filter((s) => s !== src)
        }
    }, [])

    // Drives the orb: real mic RMS while listening, real playback amplitude
    // (via AnalyserNode) while the agent is speaking. Written straight to the
    // DOM through `orbRef` rather than React state, since this runs every
    // animation frame and a state update per frame would be ~60 re-renders/s
    // for a value nothing else in the tree needs.
    //
    // idle/connecting/thinking hand the orb back to plain CSS keyframes
    // (see .omni-voice-orb--* in globals.css) instead of being driven from
    // here — there's no meaningful audio level in those modes, and a CSS
    // animation always wins the cascade over a same-property inline style
    // while it's running, so writing one from here would just be wasted
    // work, not a visual bug. The `reactive` gate below is what hands
    // control back and forth cleanly. Note this loop only ever READS
    // modeRef — it must never call setMode itself (see file docstring).
    const runOrbLoop = useCallback(() => {
        const el = orbRef.current
        const reactive = modeRef.current === 'listening' || modeRef.current === 'speaking'

        if (!reactive) {
            if (el && el.style.transform) {
                el.style.transform = ''
                el.style.removeProperty('--orb-glow')
            }
            smoothedLevelRef.current = 0
            rafRef.current = requestAnimationFrame(runOrbLoop)
            return
        }

        let rawLevel: number
        if (modeRef.current === 'speaking') {
            const analyser = playAnalyserRef.current
            let agentLevel = 0
            if (analyser) {
                if (!analyserBufRef.current || analyserBufRef.current.length !== analyser.fftSize) {
                    analyserBufRef.current = new Uint8Array(analyser.fftSize)
                }
                const buf = analyserBufRef.current
                analyser.getByteTimeDomainData(buf as any)
                let sum = 0
                for (let i = 0; i < buf.length; i++) {
                    const v = (buf[i] - 128) / 128
                    sum += v * v
                }
                agentLevel = Math.sqrt(sum / buf.length)
            }
            rawLevel = Math.min(1, agentLevel * 2.2)
        } else {
            rawLevel = Math.min(1, userLevelRef.current * 3.5)
        }
        // Exponential smoothing instead of a CSS transition: both --orb-glow
        // and transform are rewritten every frame from here, and a CSS
        // transition racing a same-property rAF write just produces jitter
        // instead of smoothness.
        smoothedLevelRef.current = smoothedLevelRef.current * 0.75 + rawLevel * 0.25
        const smoothed = smoothedLevelRef.current

        if (el) {
            const scale = 1 + smoothed * 0.22
            el.style.transform = `scale(${scale.toFixed(3)})`
            el.style.setProperty('--orb-glow', String(0.35 + smoothed * 0.65))
        }

        rafRef.current = requestAnimationFrame(runOrbLoop)
    }, [orbRef])

    const toggleMute = useCallback(() => {
        mutedRef.current = !mutedRef.current
        setMuted(mutedRef.current)
        if (mutedRef.current) userLevelRef.current = 0
    }, [])

    const stop = useCallback(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        if (speakingEndTimerRef.current !== null) {
            window.clearTimeout(speakingEndTimerRef.current)
            speakingEndTimerRef.current = null
        }
        micNodeRef.current?.disconnect()
        if (micNodeRef.current) micNodeRef.current.onaudioprocess = null
        micNodeRef.current = null
        micStreamRef.current?.getTracks().forEach((t) => t.stop())
        micStreamRef.current = null
        micCtxRef.current?.close().catch(() => {})
        micCtxRef.current = null
        stopAllPlayback()
        playCtxRef.current?.close().catch(() => {})
        playCtxRef.current = null
        playAnalyserRef.current = null
        wsRef.current?.close()
        wsRef.current = null
        readyRef.current = false
        pendingAudioRef.current = []
        mutedRef.current = false
        setMuted(false)
        if (orbRef.current) orbRef.current.style.transform = ''
        setMode('idle')
        setConnectionState((s) => (s === 'error' ? 'error' : 'closed'))
    }, [orbRef, setMode, stopAllPlayback])

    const start = useCallback(async () => {
        setErrorMessage(null)
        setCurrentTurn(null)
        setLiveTranscript('')
        activeTurnIdRef.current = 0
        readyRef.current = false
        pendingAudioRef.current = []
        setConnectionState('connecting')

        try {
            const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
            const token = await getToken()
            const guestId = token ? null : getOrCreateGuestId()

            const threadRes = await fetchWithAuth(`${backendUrl}/get_thread_id?origin=voice`)
            if (!threadRes.ok) throw new Error('无法创建语音会话')
            const threadData = await threadRes.json()
            const threadId = typeof threadData === 'string' ? threadData : threadData?.thread_id
            if (!threadId) throw new Error('无法创建语音会话')

            // Same personalization fields the main chat sends per turn
            // (buildPersonalization in chat-view.tsx), just the two that
            // don't need a settings panel — see core/voice/agent.py's
            // _build_turn_content, which formats them with the exact same
            // format_system_reminder the main agent uses. Best-effort: a
            // location lookup failure shouldn't block starting the call.
            const userLocalDatetime = getLocalISOString()
            let userLocation: string | null = null
            try {
                const loc = await getUserLocation(false)
                userLocation = loc?.value || null
            } catch {}

            playCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
            const analyser = playCtxRef.current.createAnalyser()
            analyser.fftSize = 512
            analyser.connect(playCtxRef.current.destination)
            playAnalyserRef.current = analyser
            nextPlayTimeRef.current = 0

            micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: VOICE_INPUT_CONSTRAINTS })
            micCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
            const source = micCtxRef.current.createMediaStreamSource(micStreamRef.current)
            // ScriptProcessorNode is deprecated but needs no separate worklet
            // module file — acceptable here, same tradeoff as the STT
            // recorder flow in search-home.tsx already ships.
            const node = micCtxRef.current.createScriptProcessor(4096, 1, 1)
            source.connect(node)
            // ScriptProcessorNode needs an output connection to keep processing,
            // but sending the mic signal to the speakers would create local
            // monitoring and make acoustic feedback more likely.
            const silentOutput = micCtxRef.current.createGain()
            silentOutput.gain.value = 0
            node.connect(silentOutput)
            silentOutput.connect(micCtxRef.current.destination)
            micNodeRef.current = node

            const wsParams = new URLSearchParams({ thread_id: threadId, user_local_datetime: userLocalDatetime })
            if (token) wsParams.set('token', token)
            else if (guestId) wsParams.set('guest_id', guestId)
            if (userLocation) wsParams.set('user_location', userLocation)

            const ws = new WebSocket(wsUrlFor(`/ws/voice?${wsParams.toString()}`))
            ws.binaryType = 'arraybuffer'
            wsRef.current = ws

            ws.onopen = () => {
                // Not "connected" yet — that's the 'ready' message below.
                // The WS handshake completing only means the backend has
                // accept()-ed; it still has to run auth/thread checks and
                // connect to Deepgram before it's actually reading audio.
            }

            ws.onclose = () => {
                setConnectionState((s) => (s === 'error' ? s : 'closed'))
            }

            ws.onerror = () => {
                setErrorMessage('连接语音服务失败')
                setConnectionState('error')
            }

            ws.onmessage = (ev) => {
                if (ev.data instanceof ArrayBuffer) {
                    const dv = new DataView(ev.data)
                    const turnId = dv.getUint32(0, false)
                    playPcm16(turnId, new Uint8Array(ev.data, 8))
                    return
                }
                let msg: any
                try {
                    msg = JSON.parse(ev.data)
                } catch {
                    return
                }
                switch (msg.type) {
                    case 'ready': {
                        readyRef.current = true
                        const buffered = pendingAudioRef.current
                        pendingAudioRef.current = []
                        for (const chunk of buffered) {
                            if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(chunk)
                        }
                        setConnectionState('connected')
                        setMode('listening')
                        rafRef.current = requestAnimationFrame(runOrbLoop)
                        break
                    }
                    case 'partial_transcript':
                        setLiveTranscript(msg.text || '')
                        break
                    case 'turn_start': {
                        activeTurnIdRef.current = msg.turn_id
                        setLiveTranscript('')
                        setMode('thinking')
                        setCurrentTurn({
                            turnId: msg.turn_id,
                            userText: msg.user_text || '',
                            agentText: '',
                            status: 'thinking',
                        })
                        break
                    }
                    case 'agent_text': {
                        if (msg.turn_id !== activeTurnIdRef.current) break
                        setMode('speaking')
                        patchCurrentTurn(msg.turn_id, (t) => ({ ...t, agentText: t.agentText + msg.delta, status: 'speaking' }))
                        break
                    }
                    case 'tool_call':
                        // Not surfaced in the UI — only what the agent actually
                        // says (already streaming via agent_text) matters here.
                        break
                    case 'turn_end': {
                        patchCurrentTurn(msg.turn_id, (t) => ({ ...t, status: 'done' }))
                        if (msg.turn_id === activeTurnIdRef.current) {
                            if (speakingEndTimerRef.current !== null) window.clearTimeout(speakingEndTimerRef.current)
                            const playCtx = playCtxRef.current
                            // All of this turn's audio chunks were already sent (the
                            // backend awaits both loops before emitting turn_end), so
                            // nextPlayTimeRef is already this turn's true finish time.
                            const remainingS = playCtx ? Math.max(0, nextPlayTimeRef.current - playCtx.currentTime) : 0
                            const turnIdAtSchedule = msg.turn_id
                            speakingEndTimerRef.current = window.setTimeout(() => {
                                speakingEndTimerRef.current = null
                                // Only apply if nothing newer (a barge-in, a fresh turn)
                                // has taken over in the meantime.
                                if (activeTurnIdRef.current === turnIdAtSchedule) setMode('listening')
                            }, remainingS * 1000 + 80)
                        }
                        break
                    }
                    case 'clear': {
                        if (speakingEndTimerRef.current !== null) {
                            window.clearTimeout(speakingEndTimerRef.current)
                            speakingEndTimerRef.current = null
                        }
                        stopAllPlayback()
                        setCurrentTurn((prev) =>
                            prev && (prev.status === 'thinking' || prev.status === 'speaking')
                                ? { ...prev, status: 'interrupted' }
                                : prev
                        )
                        activeTurnIdRef.current = msg.turn_id
                        setMode('listening')
                        break
                    }
                    case 'error': {
                        if (msg.turn_id) {
                            patchCurrentTurn(msg.turn_id, (t) => ({ ...t, status: 'error', errorDetail: msg.detail }))
                        } else {
                            // Connection-level error (e.g. backend missing API keys) —
                            // nothing to recover from client-side, so surface it and
                            // tear the session down.
                            setErrorMessage(msg.detail || '语音服务出错')
                            setConnectionState('error')
                            stop()
                        }
                        break
                    }
                }
            }

            node.onaudioprocess = (e) => {
                const input = e.inputBuffer.getChannelData(0)
                if (mutedRef.current) {
                    userLevelRef.current = 0
                    return
                }
                userLevelRef.current = rms(input)
                const down = downsampleTo16k(input, micCtxRef.current!.sampleRate)
                const pcm = floatTo16BitPCM(down)
                if (readyRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(pcm)
                } else {
                    // Not ready yet (backend still doing auth/thread checks
                    // and connecting to Deepgram) — queue instead of
                    // dropping, so speaking right as the call connects
                    // doesn't lose its first words. Flushed in the 'ready'
                    // handler above. Capped defensively; a real "ready"
                    // shows up in well under a second, so this bound is
                    // only ever hit if the connection never comes up.
                    if (pendingAudioRef.current.length < 200) pendingAudioRef.current.push(pcm)
                }
            }
        } catch (e: any) {
            setErrorMessage(e?.message || '无法访问麦克风')
            setConnectionState('error')
            stop()
        }
    }, [orbRef, patchCurrentTurn, playPcm16, runOrbLoop, setMode, stop, stopAllPlayback, getToken, fetchWithAuth])

    useEffect(() => () => stop(), [stop])

    return {
        connectionState,
        orbMode,
        muted,
        currentTurn,
        liveTranscript,
        errorMessage,
        start,
        stop,
        toggleMute,
    }
}

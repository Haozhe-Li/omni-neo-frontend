'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowUp, Copy, Check, ThumbsUp, ThumbsDown, Share, Menu, Search, Globe, X, CloudSun, ExternalLink, Droplets, Wind, Eye, TrendingUp, TrendingDown, Minus, Mic, Loader2, MoreHorizontal, DollarSign, Sparkles } from 'lucide-react'
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
import { useAuth } from '@clerk/nextjs'
import type { LightChatMapPoint } from '@/components/light-chat-mini-map'

const LightChatMiniMap = dynamic(
  () => import('@/components/light-chat-mini-map').then((mod) => mod.LightChatMiniMap),
  { ssr: false }
)

const CurrencyWidget = dynamic(
  () => import('@/components/currency-widget').then((mod) => mod.CurrencyWidget),
  { ssr: false }
)

interface LightChatViewProps {
  query: string
  threadId: string
  onNewSearch: () => void
  onToggleSidebar?: () => void
  isMobile?: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  use_search?: boolean
  follow_up_content?: string
  sources?: LightChatSource[]
  stock?: LightChatStock | null
  weather?: LightChatWeather | null
  currency?: LightChatCurrency | null
  mapPoints?: LightChatMapPoint[]
  steps?: LightChatStep[]
}

interface LightChatStep {
  type: 'tool_call'
  tool: string
  args: any
  timestamp: number
}

interface LightChatSource {
  title: string
  url: string
  content?: string
}

interface LightChatStockData {
  symbol?: string
  companyName?: string
  currentPrice?: number
  currency?: string
  change?: number
  changePercent?: number
}

interface LightChatStock {
  success?: boolean
  data?: LightChatStockData
  timestamp?: number
}

interface LightChatWeatherTemperature {
  temp?: number
  temp_max?: number
  temp_min?: number
  feels_like?: number
}

interface LightChatWeatherWind {
  speed?: number
  deg?: number
}

interface LightChatWeather {
  location?: unknown
  status?: string
  detailed_status?: string
  weather_icon_name?: string
  humidity?: number
  visibility_distance?: number
  precipitation_probability?: number | null
  temperature?: LightChatWeatherTemperature
  wind?: LightChatWeatherWind
}

interface LightChatCurrency {
  amount?: number
  base?: string
  date?: string
  rates?: Record<string, number>
}

function normalizeSources(raw: unknown): LightChatSource[] {
  if (!Array.isArray(raw)) return []
  return raw.reduce<LightChatSource[]>((acc, item) => {
    if (!item || typeof item !== 'object') return acc
    const source = item as Record<string, unknown>
    const title = typeof source.title === 'string' ? source.title.trim() : ''
    const url = typeof source.url === 'string' ? source.url.trim() : ''
    const content = typeof source.content === 'string' ? source.content.trim() : undefined
    if (!title || !url) return acc
    acc.push({ title, url, content })
    return acc
  }, [])
}

function getResponseSources(data: unknown): LightChatSource[] {
  if (!data || typeof data !== 'object') return []
  const payload = data as Record<string, unknown>
  return normalizeSources(payload.sources ?? payload.source)
}

function normalizeStock(raw: unknown): LightChatStock | null {
  if (!raw || typeof raw !== 'object') return null
  const stock = raw as LightChatStock
  if (typeof stock.success === 'boolean' && !stock.success) {
    return stock
  }
  if (stock.data && typeof stock.data === 'object') {
    return stock
  }
  return null
}

function normalizeCurrency(raw: unknown): LightChatCurrency | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, any>
  const currency = (payload.currency || payload) as LightChatCurrency
  if (typeof currency.amount === 'number' && typeof currency.base === 'string') {
    return currency
  }
  return null
}

function normalizeWeather(raw: unknown): LightChatWeather | null {
  if (!raw || typeof raw !== 'object') return null
  const weather = raw as LightChatWeather
  const hasStatus = typeof weather.status === 'string' || typeof weather.detailed_status === 'string'
  const hasTemp = typeof weather.temperature?.temp === 'number'
  const hasHumidity = typeof weather.humidity === 'number'
  if (!hasStatus && !hasTemp && !hasHumidity) return null
  return weather
}

function toCoordinateNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function toOptionalInteger(value: unknown) {
  const num = toOptionalNumber(value)
  return typeof num === 'number' ? Math.round(num) : undefined
}

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeMapPoints(raw: unknown): LightChatMapPoint[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).points)
      ? (raw as Record<string, unknown>).points as unknown[]
      : []

  return list.reduce<LightChatMapPoint[]>((acc, item, index) => {
    if (!item || typeof item !== 'object') return acc
    const mapItem = item as Record<string, unknown>
    const lat = toCoordinateNumber(mapItem.lat ?? mapItem.latitude)
    const lng = toCoordinateNumber(mapItem.lng ?? mapItem.lon ?? mapItem.longitude ?? mapItem.long)
    if (lat == null || lng == null) return acc

    const nameRaw = mapItem.name ?? mapItem.title ?? mapItem.location ?? mapItem.place
    const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : `Location ${index + 1}`
    const idRaw = mapItem.id
    const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw : `${lat}-${lng}-${index}`
    const position = toOptionalInteger(mapItem.position ?? mapItem.pos ?? mapItem.rank)
    const url = toOptionalString(mapItem.url)
    const address = toOptionalString(mapItem.address ?? mapItem.formatted_address ?? mapItem.location_address)
    const rating = toOptionalNumber(mapItem.rating ?? mapItem.google_rating ?? mapItem.score)
    const reviewCount = toOptionalInteger(mapItem.review_count ?? mapItem.ratingCount ?? mapItem.user_ratings_total ?? mapItem.reviews)
    const priceLevel = toOptionalString(mapItem.price_level ?? mapItem.priceLevel ?? mapItem.price ?? mapItem.price_range)
    const category = toOptionalString(mapItem.category ?? mapItem.type ?? mapItem.place_type)
    const status = toOptionalString(mapItem.business_status ?? mapItem.status ?? mapItem.opening_status)
    const imageUrl = toOptionalString(mapItem.image_url ?? mapItem.image ?? mapItem.thumbnail)
    const cid = toOptionalString(mapItem.cid ?? mapItem.google_cid)

    acc.push({ id, name, lat, lng, position, url, address, rating, reviewCount, priceLevel, category, status, imageUrl, cid })
    return acc
  }, [])
}

function formatStockPrice(price?: number, currency = 'USD') {
  if (typeof price !== 'number' || Number.isNaN(price)) return '--'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(price)
  } catch {
    return `${currency} ${price.toFixed(2)}`
  }
}

function formatStockDelta(change?: number, changePercent?: number) {
  if (typeof change !== 'number' || typeof changePercent !== 'number') return null
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`
}

function getStockDeltaTone(change?: number) {
  if (typeof change !== 'number' || Number.isNaN(change)) return 'text-[var(--muted-foreground)]'
  if (change > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (change < 0) return 'text-rose-600 dark:text-rose-400'
  return 'text-[var(--muted-foreground)]'
}

function getSourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'External source'
  }
}

function getYahooQuoteUrl(symbol?: string) {
  if (!symbol) return ''
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
}

function getOpenWeatherMapUrl() {
  return 'https://openweathermap.org/'
}

function toCelsius(temp?: number) {
  if (typeof temp !== 'number' || Number.isNaN(temp)) return null
  return temp > 170 ? temp - 273.15 : temp
}

function shouldUseFahrenheit() {
  if (typeof window === 'undefined') return false
  const savedLang = (localStorage.getItem('omni_response_language') || '').toLowerCase()
  const normalizedSaved = savedLang.replace('_', '-')
  const locale = normalizedSaved && normalizedSaved !== 'auto' ? normalizedSaved : (navigator.language || '').toLowerCase()
  if (!locale) return false
  return locale.startsWith('en-us')
}

function formatTemperature(temp?: number, useFahrenheit = false) {
  const celsius = toCelsius(temp)
  if (celsius == null) return '--'
  if (!useFahrenheit) return `${Math.round(celsius)}°C`
  const fahrenheit = (celsius * 9) / 5 + 32
  return `${Math.round(fahrenheit)}°F`
}

function formatWeatherMeta(msg: Message) {
  const humidity = typeof msg.weather?.humidity === 'number' ? `${msg.weather.humidity}% humidity` : null
  const windSpeed = typeof msg.weather?.wind?.speed === 'number' ? `${msg.weather.wind.speed.toFixed(1)} m/s wind` : null
  return [humidity, windSpeed].filter(Boolean).join(' · ')
}

function getWeatherLocation(weather?: LightChatWeather | null) {
  if (!weather?.location) return ''
  if (typeof weather.location === 'string') return weather.location
  if (typeof weather.location === 'object') {
    const obj = weather.location as Record<string, unknown>
    const city = typeof obj.city === 'string' ? obj.city : typeof obj.name === 'string' ? obj.name : ''
    const country = typeof obj.country === 'string' ? obj.country : ''
    return [city, country].filter(Boolean).join(', ')
  }
  return ''
}

function formatVisibility(visibilityDistance?: number) {
  if (typeof visibilityDistance !== 'number' || Number.isNaN(visibilityDistance)) return null
  return `${(visibilityDistance / 1000).toFixed(1)} km visibility`
}

function getWeatherTone(status?: string) {
  const normalized = (status || '').toLowerCase()
  if (normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('thunder')) {
    return 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  }
  if (normalized.includes('clear')) {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
  if (normalized.includes('snow') || normalized.includes('mist') || normalized.includes('fog')) {
    return 'bg-slate-500/10 text-slate-700 dark:text-slate-300'
  }
  return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

function getStepLabel(step: LightChatStep) {
  if (step.tool === 'get_stock_data_light') {
    return `Searching for ${step.args?.symbol || 'stock'} data`
  }
  if (step.tool === 'get_realtime_currency_rate_light' || step.tool === 'get_realtime_currency_rate') {
    return `Checking currency rates for ${step.args?.base || step.args?.from_currency || 'requested currency'}`
  }
  if (step.tool === 'get_weather_light') {
    return `Checking weather in ${step.args?.location || 'requested location'}`
  }
  if (step.tool === 'google_search_light') {
    return `Searching for "${step.args?.query || '...'}"`
  }
  if (step.tool === 'google_search_places_light') {
    return `Searching places for "${step.args?.query || step.args?.location || '...'}"`
  }
  if (step.tool === 'load_web_page_light') {
    return `Visiting web page "${step.args?.url || '...'}"`
  }
  return `Using ${step.tool}`
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return extractNodeText(withProps.props?.children)
  }
  return ''
}

function CodeCopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = getText().trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copied')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Failed to copy code')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-background/80 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

const markdownComponents: Components = {
  pre: ({ children }: any) => {
    if (children?.props?.className?.includes('language-mermaid')) {
      return <>{children}</>
    }
    return (
      <div className="relative group my-4">
        <pre>{children}</pre>
        <CodeCopyButton getText={() => extractNodeText(children)} />
      </div>
    )
  },
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (className?.includes('language-mermaid')) {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />
    }
    if (isInline) {
      return (
        <code
          className="rounded-md border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[0.9em] text-foreground"
          {...props}
        >
          {children}
        </code>
      )
    }
    return <code className={className} {...props}>{children}</code>
  },
  a: ({ className, ...props }) => (
    <a
      {...props}
      className={[
        className,
        'text-[var(--accent)] hover:underline underline-offset-2 decoration-[0.08em] transition-colors',
      ].filter(Boolean).join(' ')}
    />
  ),
  strong: ({ children }) => <span className="font-normal">{children}</span>,
  em: ({ children }) => <span className="font-normal" style={{ fontStyle: 'normal' }}>{children}</span>,
  h1: ({ children }) => <span className="block text-xl font-normal my-4">{children}</span>,
  h2: ({ children }) => <span className="block text-lg font-normal my-3">{children}</span>,
  h3: ({ children }) => <span className="block text-md font-normal my-2">{children}</span>,
}

const isUntitledTitle = (value?: string) => {
  const normalized = (value || '').trim().toLowerCase()
  return !normalized || normalized === 'untitled' || normalized === 'untitled chat'
}

const inferTitleFromMessages = (messages: Message[], fallback: string) => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim())
  return firstUserMessage?.content?.trim() || fallback
}

const fetchedTitleThreadSet = new Set<string>()
const inFlightTitleThreadSet = new Set<string>()

export function LightChatView({ query, threadId, onNewSearch, onToggleSidebar, isMobile = false }: LightChatViewProps) {
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK === 'true'
  const { isSignedIn } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'user', content: query },
    { role: 'assistant', content: '...' } // Loading placeholder
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [followUpText, setFollowUpText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isSstPending, setIsSstPending] = useState(false)
  const lastAutoScrolledAssistantKeyRef = useRef<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)
  const isInitializedRef = useRef(false)

  const [title, setTitle] = useState(query)
  const [useFahrenheit, setUseFahrenheit] = useState(false)
  const [isSourceSidebarOpen, setIsSourceSidebarOpen] = useState(false)
  const [sidebarSources, setSidebarSources] = useState<LightChatSource[]>([])

  const handleOpenSidebar = (sources: LightChatSource[]) => {
    setSidebarSources(sources)
    setIsSourceSidebarOpen(true)
  }

  const { fetchWithAuth } = useApi()

  const syncToBackend = useCallback((msgs: Message[], syncTitle?: string) => {
    if (!threadId || isMockMode) return
    const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
    const payloadMessages = msgs.map((message, index) => {
      if (index === 0) {
        return { ...message, mode: 'light' }
      }
      return message
    })
    const body: Record<string, unknown> = { messages: payloadMessages }
    if (syncTitle && !isUntitledTitle(syncTitle)) body.title = syncTitle
    fetchWithAuth(`${backendUrl}/api/threads/${threadId}/sync`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).catch(() => { /* fire-and-forget */ })
  }, [threadId, fetchWithAuth, isMockMode])

  const getStoredTitle = useCallback(() => {
    if (typeof window === 'undefined' || !threadId) return ''
    const stored = localStorage.getItem(threadId)
    if (!stored) return ''
    try {
      const parsed = JSON.parse(stored)
      const parsedTitle = typeof parsed?.title === 'string' ? parsed.title.trim() : ''
      return parsedTitle
    } catch {
      return ''
    }
  }, [threadId])

  useEffect(() => {
    let lastAssistantIndex = -1
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        lastAssistantIndex = index
        break
      }
    }
    if (lastAssistantIndex < 0) return
    const assistantContent = messages[lastAssistantIndex]?.content ?? ''
    const assistantPhase = assistantContent === '...' ? 'placeholder' : 'final'
    const scrollKey = `${lastAssistantIndex}:${assistantPhase}`
    if (scrollKey === lastAutoScrolledAssistantKeyRef.current) return

    lastAutoScrolledAssistantKeyRef.current = scrollKey
    requestAnimationFrame(() => {
      // Scroll to the user query preceding the AI reply so user sees their own question at the top
      const userIndex = lastAssistantIndex - 1
      const target = containerRef.current?.querySelector(
        `[data-message-index="${userIndex >= 0 ? userIndex : lastAssistantIndex}"]`
      ) as HTMLElement | null
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [messages])

  // Fetch Title effect
  useEffect(() => {
    setUseFahrenheit(shouldUseFahrenheit())
  }, [])

  useEffect(() => {
    const fetchTitle = async () => {
      try {
        if (!threadId) return
        if (isUntitledTitle(query)) return
        if (!isInitializedRef.current) return
        if (!isUntitledTitle(title)) {
          fetchedTitleThreadSet.add(threadId)
          return
        }

        const storedTitle = getStoredTitle()
        if (!isUntitledTitle(storedTitle)) {
          setTitle(storedTitle)
          fetchedTitleThreadSet.add(threadId)
          return
        }

        if (fetchedTitleThreadSet.has(threadId) || inFlightTitleThreadSet.has(threadId)) return
        inFlightTitleThreadSet.add(threadId)

        const apiEndpoint =
          process.env.NEXT_PUBLIC_USE_MOCK === 'true'
            ? '/api/mock-get-title'
            : process.env.NEXT_PUBLIC_BACKEND_URL
              ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/get_title`
              : '/api/get_title'

        if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') return;

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        })

        if (!response.ok) throw new Error('Failed to fetch title')

        const data = await response.json()
        const newTitle = typeof data === 'string' ? data : data?.title
        if (newTitle && !isUntitledTitle(newTitle)) {
          setTitle(newTitle)
          fetchedTitleThreadSet.add(threadId)
          if (typeof window !== 'undefined' && threadId) {
            const stored = localStorage.getItem(threadId)
            if (stored) {
              try {
                const chatData = JSON.parse(stored)
                chatData.title = newTitle
                localStorage.setItem(threadId, JSON.stringify(chatData))
                syncToBackend(Array.isArray(chatData.chat_history) ? chatData.chat_history : [], newTitle)
              } catch (e) { }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch title:', error)
      } finally {
        if (threadId) {
          inFlightTitleThreadSet.delete(threadId)
        }
      }
    }

    // Only fetch if not using mock, or if mock has a specific endpoint
    fetchTitle()
  }, [query, threadId, title, getStoredTitle])

  const handleStreamResponse = useCallback(async (response: Response, initialHistory: Message[]) => {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) throw new Error('Failed to get stream reader')

    let buffer = ''
    let currentSteps: LightChatStep[] = []

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
            const newStep: LightChatStep = {
              type: 'tool_call',
              tool: data.tool,
              args: data.args,
              timestamp: Date.now()
            }
            currentSteps = [...currentSteps, newStep]
            setMessages(prev => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, steps: currentSteps }
              }
              return copy
            })
          } else if (data.type === 'answer') {
            const answer = data.answer || "No answer returned."
            const use_search = !!data.use_search
            const sources = getResponseSources(data)
            const stock = normalizeStock(data.stock)
            const weather = normalizeWeather(data.weather)
            const currency = normalizeCurrency(data.currency)
            const mapPoints = normalizeMapPoints(data.map)

            const assistantMsg: Message = {
              role: 'assistant',
              content: answer,
              use_search,
              sources,
              stock,
              weather,
              currency,
              mapPoints,
              steps: currentSteps
            }

            const finalMessages = [...initialHistory, assistantMsg]
            setMessages(finalMessages)

            if (threadId) {
              const historyData = {
                thread_id: threadId,
                query: initialHistory[0].content,
                type: 'light',
                chat_history: finalMessages,
                timestamp: Date.now(),
                title: title || initialHistory[0].content
              }
              localStorage.setItem(threadId, JSON.stringify(historyData))
              syncToBackend(finalMessages, historyData.title)
            }
            setIsLoading(false)
            return
          }
        } catch (e) {
          console.error('Error parsing SSE chunk', e)
        }
      }
    }
    setIsLoading(false)
  }, [threadId, title, syncToBackend])

  // Load from LocalStorage OR Fetch initial
  useEffect(() => {
    const initChat = async () => {
      if (!isMockMode && isSignedIn) {
        try {
          const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
          const res = await fetchWithAuth(`${backendUrl}/api/threads/${threadId}`)
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data?.messages) && data.messages.length > 0) {
              const remoteMessages = data.messages as Message[]
              const remoteRawTitle = typeof data?.title === 'string' ? data.title.trim() : ''
              const resolvedTitle = isUntitledTitle(remoteRawTitle)
                ? inferTitleFromMessages(remoteMessages, query)
                : remoteRawTitle
              setMessages(remoteMessages)
              setTitle(resolvedTitle)
              if (!isUntitledTitle(resolvedTitle)) fetchedTitleThreadSet.add(threadId)
              setIsLoading(false)

              if (typeof window !== 'undefined') {
                const historyData = {
                  thread_id: threadId,
                  query,
                  type: 'light',
                  model: 'light',
                  chat_history: remoteMessages,
                  timestamp: Date.now(),
                  title: resolvedTitle
                }
                localStorage.setItem(threadId, JSON.stringify(historyData))
              }
              if (isUntitledTitle(remoteRawTitle) && !isUntitledTitle(resolvedTitle)) {
                syncToBackend(remoteMessages, resolvedTitle)
              }
              isInitializedRef.current = true
              return
            }
          }
        } catch { }
      }

      if (typeof window !== 'undefined' && threadId) {
        const stored = localStorage.getItem(threadId)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            if (data.thread_id === threadId && data.type === 'light' && data.chat_history && Array.isArray(data.chat_history)) {
              setMessages(data.chat_history)
              if (data.title) {
                setTitle(data.title)
                if (!isUntitledTitle(data.title)) fetchedTitleThreadSet.add(threadId)
              }
              setIsLoading(false)
              isInitializedRef.current = true
              return
            }
          } catch (e) { }
        }
      }

      setIsLoading(true)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
        const endpoint = baseUrl.endsWith('/') ? `${baseUrl}light_chat` : `${baseUrl}/light_chat`
        const personalization: any = {}
        if (typeof window !== 'undefined') {
          const savedLang = localStorage.getItem('omni_response_language')
          if (savedLang && savedLang !== 'auto') personalization.response_language = savedLang
          const savedEnableMemories = localStorage.getItem('omni_enable_memories')
          if (savedEnableMemories === 'true') {
            const m = getMemories()
            if (m) personalization.memories = m
          }
        }
        const locData = await getUserLocation(false)
        personalization.user_local_datetime = getLocalISOString()
        if (locData?.value) personalization.user_location = locData.value

        const payload: any = { query, thread_id: threadId }
        if (Object.keys(personalization).length > 0) payload.personalization = personalization

        appendQueryToMemoryQueue(query)
        const res = await fetchWithAuth(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const message = getAiRequestErrorMessage(res.status)
          toast.error(message)
          throw new Error(message)
        }
        await handleStreamResponse(res, [{ role: 'user', content: query }])
      } catch (e) {
        console.error(e)
        const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
        setMessages(prev => {
          const copy = [...prev]
          copy[1] = { role: 'assistant', content: errorMessage }
          return copy
        })
        setIsLoading(false)
      }
      isInitializedRef.current = true
    }
    initChat()
  }, [threadId, query, fetchWithAuth, isMockMode, isSignedIn, handleStreamResponse, syncToBackend])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const currentFollowUpText = followUpText
    const userMsg: Message = { role: 'user', content: input, follow_up_content: currentFollowUpText || undefined }
    const newHistory = [...messages, userMsg]
    setMessages([...newHistory, { role: 'assistant', content: '...' }])
    setInput('')
    setFollowUpText('')
    setIsLoading(true)

    if (threadId) {
      const historyData = {
        thread_id: threadId,
        query: query,
        type: 'light',
        chat_history: newHistory,
        timestamp: Date.now(),
        title: title || query
      }
      localStorage.setItem(threadId, JSON.stringify(historyData))
      syncToBackend(newHistory, historyData.title)
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
      const endpoint = baseUrl.endsWith('/') ? `${baseUrl}light_chat` : `${baseUrl}/light_chat`

      const personalization: any = {}
      if (typeof window !== 'undefined') {
        const savedLang = localStorage.getItem('omni_response_language')
        if (savedLang && savedLang !== 'auto') {
          personalization.response_language = savedLang
        }
        const savedEnableMemories = localStorage.getItem('omni_enable_memories')
        if (savedEnableMemories === 'true') {
          const m = getMemories()
          if (m) personalization.memories = m
        }
      }

      const locData = await getUserLocation(false)
      personalization.user_local_datetime = getLocalISOString()
      if (locData?.value) personalization.user_location = locData.value

      const payload: any = {
        query: input,
        thread_id: threadId,
        ...(currentFollowUpText ? { follow_up_content: currentFollowUpText } : {})
      }
      if (Object.keys(personalization).length > 0) payload.personalization = personalization

      appendQueryToMemoryQueue(input)

      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const message = getAiRequestErrorMessage(res.status)
        toast.error(message)
        throw new Error(message)
      }

      await handleStreamResponse(res, newHistory)

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '请求失败，请稍后重试。'
      setMessages(prev => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: errorMessage }
        return copy
      })
      setIsLoading(false)
    }
  }

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    }
  }

  const handleFeatureComingSoon = () => {
    toast.info('Feature coming soon')
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shouldSubmitOnEnter(e)) return
    e.preventDefault()
    handleSend()
  }

  const handleSst = useCallback(() => {
    if (isLoading) return
    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }

    const RecognitionCtor = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null

    if (!RecognitionCtor) {
      toast.info('Speech-to-text is not supported in this browser.')
      return
    }

    let transcript = ''
    try {
      const recognition = new RecognitionCtor()
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US'
      recognition.interimResults = false
      recognition.continuous = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsRecording(true)
        setIsSstPending(false)
      }
      recognition.onresult = (event: any) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const part = event.results[index]?.[0]?.transcript
          if (typeof part === 'string') transcript += part
        }
      }
      recognition.onerror = () => {
        setIsSstPending(false)
        setIsRecording(false)
        toast.error('Speech recognition failed. Please retry.')
      }
      recognition.onend = () => {
        setIsSstPending(false)
        setIsRecording(false)
        recognitionRef.current = null
        const finalText = transcript.trim()
        if (!finalText) return
        setInput((prev) => {
          const base = prev.trim()
          return base ? `${base} ${finalText}` : finalText
        })
      }

      recognitionRef.current = recognition
      setIsSstPending(true)
      recognition.start()
    } catch {
      setIsSstPending(false)
      setIsRecording(false)
      recognitionRef.current = null
      toast.error('Unable to start speech recognition.')
    }
  }, [isLoading, isRecording])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.()
      recognitionRef.current = null
    }
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--background)]">
      {/* Main Chat Area */}
      <div className={`flex flex-col h-full bg-[var(--background)] relative flex-1 min-w-0 transition-all duration-300 ${isSourceSidebarOpen ? 'sm:mr-80' : ''}`} ref={containerRef}>
        <TextSelectionMenu
          containerRef={containerRef}
          showCheckSource={false}
          onFollowUp={(text) => setFollowUpText(text)}
          allowedSelectors={['[data-selection-scope="assistant-message"]']}
        />
        {/* Header */}
        <header className="flex-shrink-0 h-14 border-b border-[var(--border-subtle)]/40 bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-between px-4 z-30 sticky top-0 relative">
          <div className="flex items-center w-10 flex-shrink-0">
            {isMobile && (
              <button
                onClick={onToggleSidebar}
                className="p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
              >
                <Menu size={20} />
              </button>
            )}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 max-w-[50%] sm:max-w-[60%] text-center pointer-events-none">
            <span className="block text-sm font-medium tracking-tight text-foreground/90 truncate pointer-events-auto">
              {title || query}
            </span>
          </div>

          <div className="w-10 flex-shrink-0" />
        </header>

        {/* Messages */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-8">
            {messages.map((msg, i) => (
              <div
                key={i}
                data-message-index={i}
                data-ai-message-index={msg.role === 'assistant' ? i : undefined}
                data-selection-scope={msg.role === 'assistant' ? 'assistant-message' : undefined}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {(() => {
                  const sources = msg.sources ?? []
                  // Parse follow-up page context for user messages
                  const isUser = msg.role === 'user'
                  const contentStr = isUser ? msg.content : ''
                  const followUpMatch = isUser ? contentStr.match(/^User want to follow up this pages:\s*\n(\{[\s\S]*?\})\n\n([\s\S]*)$/) : null
                  let followUpPage: { title: string; url: string } | null = null
                  let userQuery = msg.content
                  if (followUpMatch) {
                    try {
                      const parsed = JSON.parse(followUpMatch[1])
                      if (parsed?.title && parsed?.url) {
                        followUpPage = parsed
                        userQuery = followUpMatch[2]
                      }
                    } catch { /* fallback */ }
                  }

                  return (
                    <>
                      {/* Follow-up page card — rendered outside/above the user bubble */}
                      {isUser && followUpPage && (
                        <a
                          href={followUpPage.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full max-w-md mb-3 block rounded-xl overflow-hidden border border-[var(--border-subtle)]/60 bg-[var(--background)] shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all group no-underline"
                        >
                          <div className="h-1 w-full bg-gradient-to-r from-[var(--accent)] to-teal-400" />
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--accent)]/10 shrink-0 group-hover:bg-[var(--accent)]/15 transition-colors">
                              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-[var(--muted-foreground)] tracking-wide mb-0.5">Following up on</p>
                              <p className="text-sm font-semibold text-[var(--foreground)] truncate leading-snug">{followUpPage.title}</p>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                          </div>
                        </a>
                      )}

                      <div
                        className={`
                              rounded-2xl px-5 py-3 flex flex-col gap-2
                              ${isUser
                            ? 'max-w-[85%] bg-[var(--secondary)] text-[var(--foreground)]'
                            : 'w-full bg-transparent text-[var(--foreground)]'
                          }
                          `}
                      >
                        {msg.role === 'assistant' && msg.content === '...' ? (
                          <div className="flex flex-col gap-4 w-full py-1 min-w-[240px] sm:min-w-[320px]">
                            {msg.steps && msg.steps.length > 0 && (
                              <div className="flex flex-col gap-3 mb-1 pl-1">
                                {msg.steps.map((step, idx) => {
                                  const isLast = idx === msg.steps!.length - 1
                                  return (
                                    <div key={idx} className="flex items-center gap-3 text-[13px] font-normal text-[var(--muted-foreground)] animate-in fade-in slide-in-from-left-2 duration-500">
                                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${isLast ? '' : 'bg-[var(--foreground)]/5'} mt-0.5`}>
                                        {isLast ? (
                                          <MoreHorizontal className="h-3.5 w-3.5 animate-pulse text-[var(--foreground)]/60" />
                                        ) : (
                                          <Check className="h-2.5 w-2.5 text-[var(--muted-foreground)]" strokeWidth={3} />
                                        )}
                                      </div>
                                      <span className="opacity-80 font-normal">{getStepLabel(step)}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            <div className="flex items-center gap-3 text-sm font-normal text-[var(--muted-foreground)] px-1">
                              <div className="h-4 w-4 flex items-center justify-center">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]/60" />
                              </div>
                              <span className="opacity-70 font-normal tracking-tight">Thinking Hard...</span>
                            </div>
                            <div className="space-y-4 w-full opacity-40 px-1 mt-1">
                              <div className="h-2 w-full bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" />
                              <div className="h-2 w-[85%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                              <div className="h-2 w-[60%] bg-[var(--muted-foreground)]/10 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        ) : (
                          <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out fill-mode-both">
                            {msg.role === 'assistant' && msg.use_search && (
                              <div className="flex items-center gap-1.5 text-xs font-normal text-[var(--muted-foreground)] bg-[var(--secondary)]/25 w-fit px-2.5 py-1 rounded-md mb-3">
                                <Globe size={12} className="opacity-60" />
                                <span>Searched the web</span>
                              </div>
                            )}
                            {msg.role === 'assistant' && ((msg.steps?.length ?? 0) > 0 || (msg.mapPoints?.length ?? 0) > 0 || msg.stock?.data?.symbol || msg.weather || msg.currency) && (
                              <div className="mb-3 space-y-2">
                                {msg.steps && msg.steps.length > 0 && (
                                  <details className="px-1 py-1 group mb-2">
                                    <summary className="list-none cursor-pointer flex items-center justify-between gap-2">
                                      <span className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
                                        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--foreground)]/5">
                                          <Check className="h-2 w-2" strokeWidth={4} />
                                        </div>
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
                                {(msg.mapPoints?.length ?? 0) > 0 && (
                                  <LightChatMiniMap points={msg.mapPoints || []} />
                                )}

                                {msg.weather && (() => {
                                  const w = msg.weather
                                  const location = getWeatherLocation(w)
                                  const tempMain = formatTemperature(w.temperature?.temp, useFahrenheit)
                                  const feelsLike = formatTemperature(w.temperature?.feels_like, useFahrenheit)
                                  const tempLow = w.temperature?.temp_min != null ? formatTemperature(w.temperature.temp_min, useFahrenheit) : null
                                  const tempHigh = w.temperature?.temp_max != null ? formatTemperature(w.temperature.temp_max, useFahrenheit) : null
                                  const humidity = typeof w.humidity === 'number' ? w.humidity : null
                                  const windSpeed = typeof w.wind?.speed === 'number' ? w.wind.speed : null
                                  const vis = typeof w.visibility_distance === 'number' ? w.visibility_distance : null
                                  const tone = getWeatherTone(w.status)

                                  return (
                                    <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]/40 bg-[var(--background)] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                                      {/* header row */}
                                      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-subtle)]/40">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <CloudSun className="h-4 w-4 text-[var(--muted-foreground)] flex-none" />
                                          <span className="text-[13px] font-normal text-[var(--foreground)] truncate">{location || 'Weather'}</span>
                                          {w.status && (
                                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-normal ${tone}`}>
                                              {w.status}
                                            </span>
                                          )}
                                        </div>
                                        <a
                                          href={getOpenWeatherMapUrl()}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors flex-none"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      </div>

                                      {/* body */}
                                      <div className="px-3.5 py-3 flex items-center justify-between gap-4">
                                        {/* temperature */}
                                        <div>
                                          <p className="text-3xl font-normal tracking-tight text-[var(--foreground)] leading-none">{tempMain}</p>
                                          <p className="text-xs text-[var(--muted-foreground)] mt-1">
                                            Feels like {feelsLike}
                                            {tempLow && tempHigh ? ` · ${tempLow} – ${tempHigh}` : ''}
                                          </p>
                                        </div>

                                        {/* stats */}
                                        <div className="flex gap-4">
                                          {humidity != null && (
                                            <div className="flex flex-col items-center gap-1">
                                              <Droplets className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                              <span className="text-xs font-normal text-[var(--foreground)]">{humidity}%</span>
                                              <span className="text-[10px] text-[var(--muted-foreground)]">Humidity</span>
                                            </div>
                                          )}
                                          {windSpeed != null && (
                                            <div className="flex flex-col items-center gap-1">
                                              <Wind className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                              <span className="text-xs font-normal text-[var(--foreground)]">{windSpeed.toFixed(1)}</span>
                                              <span className="text-[10px] text-[var(--muted-foreground)]">m/s</span>
                                            </div>
                                          )}
                                          {vis != null && (
                                            <div className="flex flex-col items-center gap-1">
                                              <Eye className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                              <span className="text-xs font-normal text-[var(--foreground)]">{(vis / 1000).toFixed(1)}</span>
                                              <span className="text-[10px] text-[var(--muted-foreground)]">km</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })()}

                                {msg.stock?.data?.symbol && (() => {
                                  const s = msg.stock.data
                                  const price = formatStockPrice(s.currentPrice, s.currency || 'USD')
                                  const delta = formatStockDelta(s.change, s.changePercent)
                                  const deltaTone = getStockDeltaTone(s.change)
                                  const TrendIcon = typeof s.change === 'number' ? (s.change > 0 ? TrendingUp : s.change < 0 ? TrendingDown : Minus) : Minus

                                  return (
                                    <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]/40 bg-[var(--background)] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                                      {/* header row */}
                                      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-subtle)]/40">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <TrendIcon className={`h-4 w-4 flex-none ${deltaTone}`} />
                                          <span className="text-[13px] font-normal text-[var(--foreground)] truncate">{s.symbol}</span>
                                          {s.companyName && (
                                            <span className="text-[11px] text-[var(--muted-foreground)] truncate hidden sm:inline">{s.companyName}</span>
                                          )}
                                        </div>
                                        <a
                                          href={getYahooQuoteUrl(s.symbol)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors flex-none"
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      </div>

                                      {/* body */}
                                      <div className="px-3.5 py-3 flex items-end justify-between gap-4">
                                        <div>
                                          <p className="text-3xl font-normal tracking-tight text-[var(--foreground)] leading-none">{price}</p>
                                          {delta && (
                                            <p className={`text-xs font-normal mt-1.5 ${deltaTone}`}>{delta}</p>
                                          )}
                                        </div>
                                        {s.companyName && (
                                          <p className="text-xs text-[var(--muted-foreground)] text-right truncate max-w-[140px] sm:hidden">{s.companyName}</p>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })()}

                                {msg.currency && (() => {
                                  const c = msg.currency
                                  if (!c.base || !c.rates || Object.keys(c.rates).length === 0) return null

                                  return (
                                    <CurrencyWidget
                                      baseCurrency={c.base}
                                      rates={c.rates}
                                      initialAmount={c.amount}
                                      date={c.date}
                                    />
                                  )
                                })()}

                              </div>
                            )}
                            {msg.role === 'user' ? (
                              <div className="max-w-none whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)]">
                                {msg.follow_up_content && (
                                  <div className="mb-2 pl-3 py-1.5 border-l-[3px] border-[var(--foreground)]/30 text-[var(--foreground)]/80 text-sm line-clamp-3">
                                    {msg.follow_up_content}
                                  </div>
                                )}
                                <div>{userQuery}</div>
                              </div>
                            ) : (
                              <div className="max-w-none blog-markdown light-chat-markdown markdown-body text-[16px] leading-[1.8]">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeHighlight, rehypeKatex, rehypeRaw]}
                                  components={markdownComponents}
                                >
                                  {preprocessMarkdown(msg.content)}
                                </ReactMarkdown>

                                {/* Removed inline sources expansion */}
                              </div>
                            )}
                            {msg.role === 'assistant' && (
                              <div className="flex items-center gap-2 mt-2 border-t border-[var(--border-subtle)] pt-2">
                                <button
                                  onClick={() => {
                                    let textToCopy = msg.content
                                    if (sources && sources.length > 0) {
                                      const refs = sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join('\n')
                                      textToCopy += `\n\n ------ \n References:\n${refs}`
                                    }
                                    handleCopy(textToCopy)
                                  }}
                                  className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                  title="Copy"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  onClick={handleFeatureComingSoon}
                                  className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                  title="Helpful"
                                >
                                  <ThumbsUp size={14} />
                                </button>
                                <button
                                  onClick={handleFeatureComingSoon}
                                  className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                  title="Not Helpful"
                                >
                                  <ThumbsDown size={14} />
                                </button>
                                <button
                                  onClick={handleFeatureComingSoon}
                                  className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
                                  title="Share"
                                >
                                  <Share size={14} />
                                </button>

                                {sources.length > 0 && (
                                  <button
                                    onClick={() => handleOpenSidebar(sources)}
                                    className="flex items-center gap-2 px-2 py-1 relative left-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-all animate-in fade-in slide-in-from-left-2 duration-300"
                                  >
                                    {sources.length > 0 && (
                                      <div className="flex -space-x-1.5 mr-0.5">
                                        {sources.slice(0, 2).map((s, si) => (
                                          <div key={si} className="w-4 h-4 rounded-full border border-[var(--background)] bg-white dark:bg-zinc-800 overflow-hidden shrink-0">
                                            <img
                                              src={`https://www.google.com/s2/favicons?domain=${getSourceDomain(s.url)}&sz=64`}
                                              className="w-full h-full object-cover"
                                              alt=""
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <span className="text-[13px] font-normal">Sources</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[var(--background)] border-t border-[var(--border-subtle)]/40">
          <div className="max-w-2xl mx-auto relative">
            {followUpText && (
              <div className="absolute bottom-[calc(100%+1rem)] left-0 right-0 flex items-center gap-3 mb-2 px-4 py-3 bg-[var(--secondary)] rounded-xl text-sm border border-[var(--border-subtle)] backdrop-blur-sm max-h-24 overflow-y-auto w-full shadow-sm z-10 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-[3px] self-stretch bg-[var(--accent)] rounded-full shrink-0" />
                <p className="text-[var(--foreground)] truncate overflow-hidden whitespace-nowrap" title={followUpText}>
                  {followUpText}
                </p>
                <button
                  onClick={() => setFollowUpText('')}
                  className="p-1 hover:bg-[var(--muted)] rounded-md shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-auto"
                  title="Clear ask omni text"
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask a follow-up"
              disabled={isLoading}
              rows={1}
              className="block w-full resize-none bg-white dark:bg-[#121212] text-[var(--foreground)] rounded-2xl pl-5 pr-28 py-4 min-h-[92px] max-h-56 overflow-y-auto focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-sm border border-[var(--border-subtle)]"
            />
            <div className="absolute right-[14px] bottom-[14px] flex items-center gap-2">
              <button
                type="button"
                onClick={handleSst}
                disabled={isLoading || isSstPending}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${isLoading || isSstPending
                  ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                  : isRecording
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80'
                  }`}
                aria-label={isRecording ? 'Stop speech to text' : 'Start speech to text'}
              >
                {isRecording && !isSstPending && (
                  <span className="absolute inset-0 rounded-full border border-white/45 animate-ping" aria-hidden="true" />
                )}
                {isSstPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={`h-4 w-4 ${isRecording ? 'animate-pulse' : ''}`} />}
              </button>

              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${!input.trim() || isLoading
                  ? 'bg-[var(--secondary)] text-[var(--muted-foreground)] cursor-not-allowed'
                  : 'bg-[var(--accent)] text-white hover:opacity-90'
                  }`}
              >
                <ArrowUp size={18} />
              </button>
            </div>
          </div>
          <div className="text-center mt-2 text-xs text-[var(--muted-foreground)] opacity-60">
            Answers generated by AI. Check important info.
          </div>
        </div>
      </div>

      {/* Sources Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-80 z-[60] transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-[-8px_0_32px_rgba(0,0,0,0.08)]
          bg-[var(--background)] border-l border-[var(--border-subtle)]/60
          ${isSourceSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full bg-[var(--background)]">
          <div className="flex items-center justify-between h-16 px-6 border-b border-[var(--border-subtle)]/40">
            <span className="text-[13px] font-bold text-[var(--foreground)] uppercase tracking-wider">{sidebarSources.length} Sources</span>
            <button
              onClick={() => setIsSourceSidebarOpen(false)}
              className="p-1.5 hover:bg-[var(--secondary)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar px-2 py-2">
            {sidebarSources.map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--secondary)] transition-all duration-200"
              >
                <div className="mt-1 w-4 h-4 rounded-sm border border-[var(--border-subtle)]/40 overflow-hidden shrink-0 bg-white flex-none">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${getSourceDomain(source.url)}&sz=64`}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.google.com/favicon.ico' }}
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col pt-0.5">
                  <p className="text-[13px] text-[var(--foreground)] font-normal leading-snug line-clamp-2 mb-0.5">
                    {source.title}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)] opacity-60 truncate">
                    {getSourceDomain(source.url)}
                  </p>
                </div>
                <ExternalLink size={12} className="shrink-0 opacity-0 group-hover:opacity-40 self-center" />
              </a>
            ))}
            {sidebarSources.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[var(--muted-foreground)]/40">
                <Globe size={32} className="mb-4 stroke-[1]" />
                <p className="text-sm font-normal">No sources found.</p>
              </div>
            )}
          </div>

          <div className="mt-auto p-4 text-[10px] text-[var(--muted-foreground)]/40 leading-relaxed border-t border-[var(--border-subtle)]/30">
            Citations are automatically generated. Verify important information with primary sources.
          </div>
        </div>
      </div>
    </div>
  )
}

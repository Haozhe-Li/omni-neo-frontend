'use client'

import dynamic from 'next/dynamic'
import { Cloud, TrendingUp, TrendingDown, MapPin, Star } from 'lucide-react'
import type { WidgetData } from '@/lib/types'

const CurrencyWidget = dynamic(
  () => import('@/components/currency-widget').then((m) => m.CurrencyWidget),
  { ssr: false }
)
const LightChatMiniMap = dynamic(
  () => import('@/components/light-chat-mini-map').then((m) => m.LightChatMiniMap),
  { ssr: false }
)

// ── helpers (ported from the old light-chat view) ──────────────────────────
function toCelsius(temp?: number) {
  if (typeof temp !== 'number' || Number.isNaN(temp)) return null
  return temp > 170 ? temp - 273.15 : temp // backend returns Kelvin
}
function formatTemp(temp?: number) {
  const c = toCelsius(temp)
  return c == null ? '--' : `${Math.round(c)}°C`
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function weatherLocation(data: any): string {
  const loc = data?.location
  if (typeof loc === 'string') return loc
  if (loc && typeof loc === 'object') {
    return [str(loc.city) || str(loc.name), str(loc.country)].filter(Boolean).join(', ')
  }
  return ''
}

// ── individual cards ───────────────────────────────────────────────────────
function WeatherCard({ data }: { data: any }) {
  const location = weatherLocation(data)
  const temp = formatTemp(data?.temperature?.temp)
  const status = str(data?.detailed_status) || str(data?.status) || 'Weather'
  const humidity = num(data?.humidity)
  const wind = num(data?.wind?.speed)
  return (
    <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="p-3.5 bg-[var(--secondary)]/50 rounded-xl shrink-0">
          <Cloud size={24} strokeWidth={1.5} className="text-[var(--foreground)] opacity-80" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-[var(--foreground)] opacity-90 truncate">{location || 'Weather'}</div>
          <div className="text-[13px] text-[var(--muted-foreground)] mt-0.5 capitalize truncate">{status}</div>
        </div>
      </div>
      <div className="flex flex-col sm:items-end shrink-0">
        <div className="text-3xl font-medium tracking-tight text-[var(--foreground)]">{temp}</div>
        <div className="text-[12px] font-medium text-[var(--muted-foreground)] mt-1 flex items-center gap-1.5 opacity-80">
          {[humidity != null ? `H: ${humidity}%` : null, wind != null ? `W: ${wind.toFixed(1)}m/s` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
    </div>
  )
}

function StockCard({ data }: { data: any }) {
  const d = data?.data && typeof data.data === 'object' ? data.data : data
  const symbol = str(d?.symbol) || str(d?.companyName) || 'Stock'
  const price = num(d?.currentPrice ?? d?.price)
  const change = num(d?.change)
  const changePct = num(d?.changePercent)
  const currency = str(d?.currency) || 'USD'
  const up = (change ?? 0) >= 0
  const priceStr =
    price != null
      ? (() => {
          try {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price)
          } catch {
            return `${currency} ${price.toFixed(2)}`
          }
        })()
      : '--'
  return (
    <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={`p-3.5 rounded-xl shrink-0 ${up ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
          {up ? <TrendingUp size={24} strokeWidth={1.5} className="text-emerald-600 dark:text-emerald-400" /> : <TrendingDown size={24} strokeWidth={1.5} className="text-rose-600 dark:text-rose-400" />}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-[var(--foreground)] opacity-90 truncate">{symbol}</div>
          <div className="text-[13px] text-[var(--muted-foreground)] mt-0.5 truncate">Stock Quote</div>
        </div>
      </div>
      <div className="flex flex-col sm:items-end shrink-0">
        <div className="text-3xl font-medium tracking-tight text-[var(--foreground)]">{priceStr}</div>
        {change != null && changePct != null && (
          <div className={`text-[12px] font-medium mt-1 flex items-center gap-1.5 opacity-90 ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {up ? '+' : ''}{change.toFixed(2)} ({up ? '+' : ''}{changePct.toFixed(2)}%)
          </div>
        )}
      </div>
    </div>
  )
}

function PlaceCard({ data }: { data: any }) {
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []
  const points = list
    .map((item, i) => {
      const lat = num(item?.lat ?? item?.latitude)
      const lng = num(item?.lng ?? item?.lon ?? item?.longitude)
      if (lat == null || lng == null) return null
      return {
        id: str(item?.id) || `${lat}-${lng}-${i}`,
        name: str(item?.name) || str(item?.title) || `Location ${i + 1}`,
        lat,
        lng,
        address: str(item?.address ?? item?.formatted_address),
        rating: num(item?.rating),
        url: str(item?.url),
      }
    })
    .filter(Boolean) as any[]

  if (points.length > 0) {
    return (
      <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col">
        <LightChatMiniMap points={points} />
      </div>
    )
  }
  // Fallback list when no coordinates are available.
  if (list.length === 0) return null
  return (
    <div className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--card)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
      {list.slice(0, 4).map((item, i) => (
        <div key={i} className="flex items-start gap-3.5">
          <div className="p-2.5 bg-[var(--secondary)]/50 rounded-xl shrink-0">
            <MapPin size={18} strokeWidth={1.5} className="text-[var(--foreground)] opacity-80" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-[15px] font-medium text-[var(--foreground)] opacity-90 truncate">{str(item?.name) || str(item?.title) || 'Place'}</div>
            {str(item?.address) && <div className="text-[13px] text-[var(--muted-foreground)] mt-1 truncate">{item.address}</div>}
            {num(item?.rating) != null && (
              <div className="flex items-center gap-1.5 text-[12px] text-[var(--muted-foreground)] mt-1.5 opacity-80">
                <Star size={12} className="fill-[var(--muted-foreground)]" /> {num(item?.rating)!.toFixed(1)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function CurrencyCard({ data }: { data: any }) {
  const payload = data?.currency && typeof data.currency === 'object' ? data.currency : data
  const base = str(payload?.base)
  const rates = payload?.rates
  if (!base || !rates || typeof rates !== 'object') return null
  return (
    <CurrencyWidget
      baseCurrency={base}
      rates={rates}
      initialAmount={num(payload?.amount) ?? 1}
      date={str(payload?.date)}
    />
  )
}

export function WidgetCards({ widgets }: { widgets?: WidgetData[] }) {
  if (!widgets || widgets.length === 0) return null
  return (
    <div className="flex flex-col gap-3 mb-3 w-full">
      {widgets.map((w, i) => {
        switch (w.widget) {
          case 'weather':
            return <WeatherCard key={i} data={w.data} />
          case 'stock':
            return <StockCard key={i} data={w.data} />
          case 'place':
            return <PlaceCard key={i} data={w.data} />
          case 'currency':
            return <CurrencyCard key={i} data={w.data} />
          default:
            return null
        }
      })}
    </div>
  )
}

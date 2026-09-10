'use client'

import dynamic from 'next/dynamic'
import { Cloud, TrendingUp, TrendingDown, ExternalLink, Droplets, Wind } from 'lucide-react'
import type { WidgetData } from '@/lib/types'

const CurrencyWidget = dynamic(
  () => import('@/components/currency-widget').then((m) => m.CurrencyWidget),
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

// ── Weather sub-components ─────────────────────────────────────────────────
function WeatherIcon({ icon, status, size = 32 }: { icon?: string; status?: string; size?: number }) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://openweathermap.org/img/wn/${icon}@2x.png`}
        alt={status || 'weather'}
        width={size}
        height={size}
        className="shrink-0"
      />
    )
  }
  return <Cloud size={Math.round(size * 0.7)} strokeWidth={1.5} className="text-[var(--foreground)] opacity-70 shrink-0" />
}

function getDayLabel(dateStr?: string): string {
  if (!dateStr) return 'Day after'
  try {
    const d = new Date(dateStr + 'T12:00:00Z')
    return d.toLocaleDateString(undefined, { weekday: 'long' })
  } catch {
    return 'Day after'
  }
}

function HourlySlot({ slot }: { slot: any }) {
  const pop = num(slot?.pop)
  const hasPop = pop != null && pop > 0
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[52px] shrink-0 py-0.5">
      <div className="text-[11px] text-[var(--muted-foreground)] tabular-nums">{str(slot?.time) || '--'}</div>
      <WeatherIcon icon={str(slot?.icon)} status={str(slot?.status)} size={36} />
      <div className="text-[13px] font-medium text-[var(--foreground)] tabular-nums">
        {slot?.temp_c != null ? `${Math.round(Number(slot.temp_c))}°` : '--'}
      </div>
      <div className={`text-[10px] tabular-nums font-medium ${hasPop ? 'text-[var(--teal)]' : 'text-transparent select-none'}`}>
        {hasPop ? `${pop}%` : '·'}
      </div>
    </div>
  )
}

function DailyRow({ label, data }: { label: string; data: any }) {
  const pop = num(data?.pop)
  const maxC = num(data?.temp_max_c)
  const minC = num(data?.temp_min_c)
  const hasPop = pop != null && pop > 0
  return (
    <div className="flex items-center gap-2.5 py-1">
      <div className="w-[76px] text-[13px] font-medium text-[var(--foreground)] shrink-0 truncate">{label}</div>
      <WeatherIcon icon={str(data?.icon)} status={str(data?.status)} size={28} />
      <div className="flex-1 text-[12px] text-[var(--muted-foreground)] capitalize truncate min-w-0">
        {str(data?.status) || '--'}
      </div>
      {hasPop && (
        <div className="text-[11px] text-[var(--teal)] shrink-0 tabular-nums font-medium">{pop}%</div>
      )}
      <div className="text-[13px] shrink-0 tabular-nums ml-1">
        <span className="font-semibold text-[var(--foreground)]">{maxC != null ? `${Math.round(maxC)}°` : '--'}</span>
        <span className="mx-1 text-[var(--ink-fainter)]">/</span>
        <span className="text-[var(--muted-foreground)]">{minC != null ? `${Math.round(minC)}°` : '--'}</span>
      </div>
    </div>
  )
}

// ── individual cards ───────────────────────────────────────────────────────
function WeatherCard({ data }: { data: any }) {
  // Support both old (flat) format and new (current + forecast) format
  const isEnhanced = !!data?.current
  const current = isEnhanced ? data.current : data

  const location = weatherLocation(data)
  const temp = formatTemp(current?.temperature?.temp)
  const feelsLike = toCelsius(current?.temperature?.feels_like)
  const status = str(current?.detailed_status) || str(current?.status) || 'Weather'
  const humidity = num(current?.humidity)
  const wind = num(current?.wind?.speed)
  const icon = str(current?.weather_icon_name)

  const todayHourly: any[] = isEnhanced ? (data.today_hourly ?? []) : []
  const tomorrow = isEnhanced && data.tomorrow && Object.keys(data.tomorrow).length > 0 ? data.tomorrow : null
  const dayAfter = isEnhanced && data.day_after_tomorrow && Object.keys(data.day_after_tomorrow).length > 0 ? data.day_after_tomorrow : null
  const hasForecast = todayHourly.length > 0 || !!tomorrow || !!dayAfter

  return (
    <div className="w-full overflow-hidden rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)]">

      {/* ── Current weather ── */}
      <div className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {icon
            ? <WeatherIcon icon={icon} status={status} size={48} />
            : <div className="shrink-0 rounded-[14px] bg-[var(--sand)] p-3"><Cloud size={22} strokeWidth={1.4} className="text-[var(--teal)]" /></div>
          }
          <div className="min-w-0">
            <div className="truncate text-[15px] leading-tight text-[var(--ink)]">{location || 'Weather'}</div>
            <div className="text-[13px] text-[var(--muted-foreground)] mt-0.5 capitalize truncate">{status}</div>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="omni-display text-[40px] leading-none text-[var(--ink)]">{temp}</div>
          {feelsLike != null && (
            <div className="text-[11px] text-[var(--muted-foreground)] mt-1 opacity-75">
              Feels like {Math.round(feelsLike)}°C
            </div>
          )}
          <div className="text-[11px] text-[var(--muted-foreground)] mt-1 flex items-center gap-2 opacity-80">
            {humidity != null && (
              <span className="flex items-center gap-0.5">
                <Droplets size={10} strokeWidth={2} />
                {humidity}%
              </span>
            )}
            {wind != null && (
              <span className="flex items-center gap-0.5">
                <Wind size={10} strokeWidth={2} />
                {wind.toFixed(1)} m/s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Today's hourly strips ── */}
      {todayHourly.length > 0 && (
        <>
          <div className="h-px bg-[var(--line-hair)]" />
          <div className="px-5 pb-3 pt-3.5">
            <div className="omni-eyebrow mb-2">Today</div>
            <div
              className="flex gap-0.5 overflow-x-auto"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {todayHourly.map((slot: any, i: number) => (
                <HourlySlot key={i} slot={slot} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Multi-day forecast ── */}
      {(tomorrow || dayAfter) && (
        <>
          <div className="h-px bg-[var(--line-hair)]" />
          <div className="px-5 pb-4 pt-3.5">
            <div className="omni-eyebrow mb-1">Forecast</div>
            {tomorrow && <DailyRow label="Tomorrow" data={tomorrow} />}
            {dayAfter && <DailyRow label={getDayLabel(dayAfter?.date)} data={dayAfter} />}
          </div>
        </>
      )}
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
    <div className="flex w-full flex-col justify-between gap-4 rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)] px-[18px] py-[17px] sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        {/* Direction reads as teal-up / rust-down rather than the usual
            green/red: the palette has exactly two accents, and borrowing a
            third pair for one widget would break the page. */}
        <div className={`shrink-0 rounded-[14px] p-3.5 ${up ? 'bg-[var(--teal-tint)]' : 'bg-[var(--rust-tint)]'}`}>
          {up
            ? <TrendingUp size={22} strokeWidth={1.4} className="text-[var(--teal)]" />
            : <TrendingDown size={22} strokeWidth={1.4} className="text-[var(--rust)]" />}
        </div>
        <div className="min-w-0">
          <div className="omni-mono truncate text-[13px] tracking-[0.04em] text-[var(--ink)]">{symbol}</div>
          <div className="omni-eyebrow mt-1">Stock quote</div>
        </div>
      </div>
      <div className="flex flex-col sm:items-end shrink-0">
        <div className="omni-display text-[34px] leading-[1.1] text-[var(--ink)]">{priceStr}</div>
        {change != null && changePct != null && (
          <div className={`mt-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] ${up ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 'bg-[var(--rust-tint)] text-[var(--rust)]'}`}>
            {up ? '+' : ''}{change.toFixed(2)} ({up ? '+' : ''}{changePct.toFixed(2)}%)
          </div>
        )}
      </div>
    </div>
  )
}

function EntityCard({ data }: { data: any }) {
  const title = str(data?.title) || str(data?.name) || 'Entity'
  const type = str(data?.type)
  const imageUrl = str(data?.image_url)
  const sourceLink = str(data?.source_link)

  return (
    <a
      href={sourceLink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex w-full items-center gap-4 overflow-hidden rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)] p-4 ${sourceLink ? 'cursor-pointer transition-colors hover:border-[var(--teal)]' : ''}`}
    >
      {imageUrl && (
        <div className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[14px] bg-[var(--sand)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="omni-display truncate text-[19px] leading-tight text-[var(--ink)]">{title}</div>
        {type && <div className="omni-eyebrow mt-1 truncate">{type}</div>}
      </div>
      {sourceLink && (
        <ExternalLink size={14} strokeWidth={1.75} className="shrink-0 text-[var(--muted-foreground)]/50" />
      )}
    </a>
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
          case 'currency':
            return <CurrencyCard key={i} data={w.data} />
          case 'entity':
            return <EntityCard key={i} data={w.data} />
          default:
            return null
        }
      })}
    </div>
  )
}

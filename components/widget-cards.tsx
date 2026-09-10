'use client'

import dynamic from 'next/dynamic'
import { Cloud, ExternalLink } from 'lucide-react'
import type { WidgetData } from '@/lib/types'

const CurrencyWidget = dynamic(
  () => import('@/components/currency-widget').then((m) => m.CurrencyWidget),
  { ssr: false }
)

// ── helpers ────────────────────────────────────────────────────────────────
function toCelsius(temp?: number) {
  if (typeof temp !== 'number' || Number.isNaN(temp)) return null
  return temp > 170 ? temp - 273.15 : temp // backend returns Kelvin
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

/**
 * The shell every widget sits in: raised paper, a mono eyebrow naming the kind
 * of thing it is, and a right-aligned meta line for where the number came from
 * or when. Identical geometry across all three so a turn that returns two
 * widgets reads as two rows of one system rather than two unrelated cards.
 */
function WidgetShell({
  label,
  meta,
  children,
}: {
  label: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <div className="w-full min-w-0 rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)] px-[18px] pb-[17px] pt-[15px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="omni-eyebrow">{label}</span>
        {meta && (
          <span className="min-w-0 truncate text-[11.5px] text-[var(--ink-faint)]">{meta}</span>
        )}
      </div>
      {children}
    </div>
  )
}

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
  return <Cloud size={Math.round(size * 0.7)} strokeWidth={1.4} className="shrink-0 text-[var(--teal)]" />
}

function getDayLabel(dateStr?: string): string {
  if (!dateStr) return 'Later'
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' })
  } catch {
    return 'Later'
  }
}

interface ForecastDay {
  label: string
  lo: number
  hi: number
  pop?: number
}

// ── individual cards ───────────────────────────────────────────────────────

/**
 * Weather as a temperature range chart, not a stack of icon rows.
 *
 * Each day is one bar spanning its low to its high, all of them scaled to the
 * same axis — so "Thursday is the cold one" and "the swing is widening" are
 * legible without reading a single number. Icon-per-row layouts can't show
 * either: they put five identical cloud glyphs in a column and make the reader
 * compare digits.
 */
function WeatherCard({ data }: { data: any }) {
  const isEnhanced = !!data?.current
  const current = isEnhanced ? data.current : data

  const place = weatherLocation(data)
  const tempC = toCelsius(current?.temperature?.temp)
  const cond = str(current?.detailed_status) || str(current?.status) || ''
  const icon = str(current?.weather_icon_name)

  const todayHourly: any[] = isEnhanced ? (data.today_hourly ?? []) : []
  const tomorrow = isEnhanced && data.tomorrow && Object.keys(data.tomorrow).length > 0 ? data.tomorrow : null
  const dayAfter =
    isEnhanced && data.day_after_tomorrow && Object.keys(data.day_after_tomorrow).length > 0
      ? data.day_after_tomorrow
      : null

  const days: ForecastDay[] = []
  // Today's range comes from the hourly series when there is one; otherwise
  // the current reading is the only point we have and the bar collapses to it.
  const hourTemps = todayHourly.map((s) => num(s?.temp_c)).filter((n): n is number => n != null)
  const todayLo = hourTemps.length ? Math.min(...hourTemps) : toCelsius(current?.temperature?.temp_min)
  const todayHi = hourTemps.length ? Math.max(...hourTemps) : toCelsius(current?.temperature?.temp_max)
  if (todayLo != null && todayHi != null) days.push({ label: 'Today', lo: todayLo, hi: todayHi })
  for (const [d, fallback] of [
    [tomorrow, 'Tue'],
    [dayAfter, 'Wed'],
  ] as const) {
    if (!d) continue
    const lo = num(d.temp_min_c)
    const hi = num(d.temp_max_c)
    if (lo == null || hi == null) continue
    days.push({
      label: d === tomorrow ? 'Tomorrow' : getDayLabel(str(d.date)) || fallback,
      lo,
      hi,
      pop: num(d.pop),
    })
  }

  const lo = days.length ? Math.min(...days.map((d) => d.lo)) : 0
  const hi = days.length ? Math.max(...days.map((d) => d.hi)) : 1
  const span = hi - lo || 1

  return (
    <WidgetShell label="Weather" meta={cond ? cond.replace(/^\w/, (c) => c.toUpperCase()) : undefined}>
      <div className="mb-1 flex items-baseline gap-3">
        <span className="omni-display text-[40px] leading-none text-[var(--ink)]">
          {tempC != null ? `${Math.round(tempC)}°` : '--'}
        </span>
        {icon && <WeatherIcon icon={icon} status={cond} size={34} />}
      </div>
      <div className="mb-3.5 text-[13px] text-[var(--ink-muted)]">
        {[place, days.length ? `H ${Math.round(hi)}°` : null, days.length ? `L ${Math.round(lo)}°` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>

      {days.length > 0 && (
        <div className="flex flex-col gap-2">
          {days.map((d) => (
            <div key={d.label} className="grid grid-cols-[58px_30px_minmax(0,1fr)_34px] items-center gap-2.5">
              <span className="omni-mono truncate text-[11px] text-[var(--ink-muted)]">{d.label}</span>
              <span className="text-right text-[12.5px] text-[var(--ink-faint)]">{Math.round(d.lo)}°</span>
              <span className="relative block h-1 rounded-full bg-[var(--sand)]">
                <span
                  className="absolute inset-y-0 block rounded-full bg-[var(--teal)]"
                  style={{
                    left: `${(((d.lo - lo) / span) * 100).toFixed(1)}%`,
                    // A day with no swing would otherwise render a zero-width
                    // bar and read as missing data rather than a flat day.
                    width: `${Math.max(4, ((d.hi - d.lo) / span) * 100).toFixed(1)}%`,
                  }}
                />
              </span>
              <span className="text-[12.5px] text-[var(--ink-body)]">{Math.round(d.hi)}°</span>
            </div>
          ))}
        </div>
      )}

      {/* Hourly is not in the source design, which stops at daily ranges — but
          the data is here and it answers "do I need a coat this afternoon",
          which the daily bars can't. Same idiom: mono times, teal for rain. */}
      {todayHourly.length > 0 && (
        <div className="mt-4 border-t border-[var(--line-hair)] pt-3.5">
          <div className="omni-eyebrow mb-2">Hourly</div>
          <div className="omni-hide-scrollbar flex gap-1 overflow-x-auto">
            {todayHourly.map((slot: any, i: number) => {
              const pop = num(slot?.pop)
              return (
                <div key={i} className="flex min-w-[50px] shrink-0 flex-col items-center gap-1 py-0.5">
                  <span className="omni-mono text-[10.5px] tabular-nums text-[var(--ink-faint)]">
                    {str(slot?.time) || '--'}
                  </span>
                  <WeatherIcon icon={str(slot?.icon)} status={str(slot?.status)} size={30} />
                  <span className="text-[12.5px] tabular-nums text-[var(--ink-body)]">
                    {slot?.temp_c != null ? `${Math.round(Number(slot.temp_c))}°` : '--'}
                  </span>
                  <span
                    className={`omni-mono text-[10px] tabular-nums ${
                      pop != null && pop > 0 ? 'text-[var(--teal)]' : 'select-none text-transparent'
                    }`}
                  >
                    {pop != null && pop > 0 ? `${pop}%` : '·'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </WidgetShell>
  )
}

/**
 * A quote, a sparkline, and the day's four numbers.
 *
 * Direction is teal-up / rust-down rather than the usual green/red: the
 * palette has exactly two accents, and borrowing a third pair for one widget
 * would make it the loudest thing in the answer.
 */
function StockCard({ data }: { data: any }) {
  const d = data?.data && typeof data.data === 'object' ? data.data : data
  const symbol = str(d?.symbol) || 'Stock'
  const name = str(d?.companyName) || str(d?.name)
  const price = num(d?.currentPrice ?? d?.price)
  const change = num(d?.change)
  const changePct = num(d?.changePercent)
  const currency = str(d?.currency) || 'USD'
  const up = (change ?? 0) >= 0

  const priceStr =
    price != null
      ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '--'

  // The sparkline and the stat row render only when the backend actually sent
  // the data — an empty axis or a row of dashes says less than nothing.
  const series = (Array.isArray(d?.series) ? d.series : Array.isArray(d?.history) ? d.history : [])
    .map((v: unknown) => (typeof v === 'object' && v !== null ? num((v as any).close ?? (v as any).price) : num(v)))
    .filter((n: number | undefined): n is number => n != null)

  let spark: string | null = null
  if (series.length > 1) {
    const sLo = Math.min(...series)
    const sHi = Math.max(...series)
    const sSpan = sHi - sLo || 1
    spark = series
      .map((v: number, i: number) =>
        `${((i / (series.length - 1)) * 120).toFixed(1)},${(32 - ((v - sLo) / sSpan) * 28).toFixed(1)}`
      )
      .join(' ')
  }

  const stats = [
    ['Open', num(d?.open ?? d?.openPrice)],
    ['High', num(d?.dayHigh ?? d?.high)],
    ['Low', num(d?.dayLow ?? d?.low)],
    ['Prev', num(d?.previousClose ?? d?.prevClose)],
  ].filter(([, v]) => v != null) as [string, number][]

  return (
    <WidgetShell label="Stock" meta={name}>
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="omni-mono text-[13px] tracking-[0.04em] text-[var(--ink)]">{symbol}</span>
      </div>
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="omni-display text-[34px] leading-[1.1] text-[var(--ink)]">{priceStr}</span>
        <span className="omni-mono text-[12px] text-[var(--ink-faint)]">{currency}</span>
        {change != null && changePct != null && (
          <span
            className={`ml-auto rounded-full px-2.5 py-1 text-[12.5px] ${
              up ? 'bg-[var(--teal-tint)] text-[var(--teal)]' : 'bg-[var(--rust-tint)] text-[var(--rust)]'
            }`}
          >
            {up ? '+' : ''}
            {change.toFixed(2)} ({up ? '+' : ''}
            {changePct.toFixed(2)}%)
          </span>
        )}
      </div>

      {spark && (
        <svg viewBox="0 0 120 34" preserveAspectRatio="none" className="mb-3 block h-[46px] w-full">
          <polygon
            points={`${spark} 120,34 0,34`}
            fill={up ? 'var(--teal-tint)' : 'var(--rust-tint)'}
          />
          <polyline
            points={spark}
            fill="none"
            stroke={up ? 'var(--teal)' : 'var(--rust)'}
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {stats.length > 0 && (
        <div className="flex gap-2 border-t border-[var(--line-hair)] pt-2.5">
          {stats.map(([k, v]) => (
            <div key={k} className="min-w-0 flex-1">
              <div className="omni-eyebrow mb-1" style={{ fontSize: 9.5, letterSpacing: '0.08em' }}>
                {k}
              </div>
              <div className="text-[13px] tabular-nums text-[var(--ink-body)]">
                {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
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
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="omni-display truncate text-[19px] leading-tight text-[var(--ink)]">{title}</div>
        {type && <div className="omni-eyebrow mt-1 truncate">{type}</div>}
      </div>
      {sourceLink && <ExternalLink size={14} strokeWidth={1.5} className="shrink-0 text-[var(--ink-fainter)]" />}
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
    <div className="mb-6 flex w-full flex-col gap-3.5">
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

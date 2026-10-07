/**
 * The four inputs the collector lets an annotator set explicitly, in the exact
 * shapes production's client produces — and the random pools behind "shuffle".
 *
 * Every format here is a copy of a production one, and the backend refuses
 * anything else (core/collector_schema.py in omni-neo), so a drift in either
 * place shows up as a rejected request, not as quietly different training data:
 *
 *   datetime   lib/utils.ts getLocalISOString():  2026-10-07T14:05:09+08:00
 *   location   lib/location.ts:                   "Tokyo, Japan (IP Approximate)"
 *                                                 "Tokyo, Japan (GPS Precise Location)"
 *                                                 (or omitted when unknown)
 *   language   components/settings-dialog.tsx:    en | zh-CN | zh-TW | ja | ko
 *                                                 ("Auto-detect" is *omitted*)
 *   memory     core/memories_update_llm.py:       markdown sections, <= 3000 chars
 *
 * No imports on purpose, so the pools can be exercised outside the app.
 */

export type Language = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko'

export interface CollectorFields {
  /** getLocalISOString() format. Always sent. */
  datetime: string
  /** "City, Country (IP Approximate | GPS Precise Location)", or '' = unknown (field omitted). */
  location: string
  /** '' = Auto-detect (field omitted; the server default applies). */
  language: Language | ''
  /** Free text for the first turn only; '' = no memory block. */
  memory: string
}

export type FieldKey = keyof CollectorFields
export type Rng = () => number

export const LANGUAGES: { value: Language | ''; label: string }[] = [
  { value: '', label: 'Auto-detect (omitted)' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

export const MAX_MEMORY_CHARS = 3000

// ── validation (mirrors core/collector_schema.py) ───────────────────────────

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
const LOCATION_RE = /^[^\n]+, [^\n]+ \((?:IP Approximate|GPS Precise Location)\)$/

/** Human-readable problems with `f`; empty when the backend will accept it. */
export function validateFields(f: CollectorFields, opts: { memoryAllowed: boolean } = { memoryAllowed: true }): string[] {
  const errors: string[] = []
  if (!DATETIME_RE.test(f.datetime) || Number.isNaN(Date.parse(f.datetime))) {
    errors.push('Time must look like 2026-10-07T14:05:09+08:00.')
  }
  if (f.location && !LOCATION_RE.test(f.location)) {
    errors.push('Location must end in "(IP Approximate)" or "(GPS Precise Location)", e.g. "Tokyo, Japan (IP Approximate)".')
  }
  if (f.memory.trim().length > MAX_MEMORY_CHARS) errors.push(`Memory is over ${MAX_MEMORY_CHARS} characters.`)
  if (!opts.memoryAllowed && f.memory.trim()) errors.push('Memory can only be set on the first turn.')
  return errors
}

// ── time ────────────────────────────────────────────────────────────────────

const pad = (n: number) => (n < 10 ? '0' + n : String(n))

/** The instant `ms`, rendered the way getLocalISOString() renders `new Date()`, at a fixed UTC offset. */
export function isoAtOffset(ms: number, offsetMinutes: number): string {
  const d = new Date(ms + offsetMinutes * 60_000) // shift, then read the UTC fields as wall-clock
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** UTC offset (minutes) of an IANA zone at instant `ms`, DST included. */
export function zoneOffsetMinutes(tz: string, ms: number): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms))
    .find((p) => p.type === 'timeZoneName')?.value // "GMT", "GMT+8", "GMT+05:30", "GMT-08:00"
  const m = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(part ?? '')
  if (!m || !m[1]) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0))
}

export function offsetOfIso(iso: string): number | null {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null
}

export type TimeRange = 'near' | 'year' | 'wide'

export const TIME_RANGES: { value: TimeRange; label: string; hint: string }[] = [
  { value: 'near', label: 'Near now (±3 days)', hint: 'Matches what live tools return today.' },
  { value: 'year', label: 'This year (±6 months)', hint: '' },
  { value: 'wide', label: '2024 – 2027', hint: 'Live tools will still answer as of today — dates may disagree.' },
]

function randomInstant(range: TimeRange, rng: Rng, now: number): number {
  const day = 86_400_000
  if (range === 'near') return now + (rng() * 6 - 3) * day
  if (range === 'year') return now + (rng() * 360 - 180) * day
  const from = Date.UTC(2024, 0, 1)
  return from + rng() * (Date.UTC(2027, 11, 31) - from)
}

/** Next turn's clock: a little later than the last one, same offset. */
export function advanceDatetime(prev: string, rng: Rng = Math.random): string {
  const off = offsetOfIso(prev)
  const t = Date.parse(prev)
  if (off === null || Number.isNaN(t)) return prev
  return isoAtOffset(t + Math.round(20_000 + rng() * 580_000), off)
}

// ── location ────────────────────────────────────────────────────────────────

interface Place { city: string; country: string; tz: string }

// City + country as lib/location.ts would name them (ipapi `city`/`country_name`,
// Nominatim `address.city`/`country`), with the zone each one lives in so a shuffled
// clock agrees with a shuffled place. Spread over the product's language markets.
export const PLACES: Place[] = [
  { city: 'Shanghai', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Beijing', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Shenzhen', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Hangzhou', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Chengdu', country: 'China', tz: 'Asia/Shanghai' },
  { city: 'Hong Kong', country: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { city: 'Taipei', country: 'Taiwan', tz: 'Asia/Taipei' },
  { city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo' },
  { city: 'Osaka', country: 'Japan', tz: 'Asia/Tokyo' },
  { city: 'Seoul', country: 'South Korea', tz: 'Asia/Seoul' },
  { city: 'Busan', country: 'South Korea', tz: 'Asia/Seoul' },
  { city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore' },
  { city: 'Bangkok', country: 'Thailand', tz: 'Asia/Bangkok' },
  { city: 'Mumbai', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Bengaluru', country: 'India', tz: 'Asia/Kolkata' },
  { city: 'Dubai', country: 'United Arab Emirates', tz: 'Asia/Dubai' },
  { city: 'Tel Aviv', country: 'Israel', tz: 'Asia/Jerusalem' },
  { city: 'Istanbul', country: 'Türkiye', tz: 'Europe/Istanbul' },
  { city: 'London', country: 'United Kingdom', tz: 'Europe/London' },
  { city: 'Dublin', country: 'Ireland', tz: 'Europe/Dublin' },
  { city: 'Paris', country: 'France', tz: 'Europe/Paris' },
  { city: 'Berlin', country: 'Germany', tz: 'Europe/Berlin' },
  { city: 'Madrid', country: 'Spain', tz: 'Europe/Madrid' },
  { city: 'Amsterdam', country: 'Netherlands', tz: 'Europe/Amsterdam' },
  { city: 'Stockholm', country: 'Sweden', tz: 'Europe/Stockholm' },
  { city: 'Warsaw', country: 'Poland', tz: 'Europe/Warsaw' },
  { city: 'Cairo', country: 'Egypt', tz: 'Africa/Cairo' },
  { city: 'Lagos', country: 'Nigeria', tz: 'Africa/Lagos' },
  { city: 'Nairobi', country: 'Kenya', tz: 'Africa/Nairobi' },
  { city: 'Johannesburg', country: 'South Africa', tz: 'Africa/Johannesburg' },
  { city: 'New York', country: 'United States', tz: 'America/New_York' },
  { city: 'Boston', country: 'United States', tz: 'America/New_York' },
  { city: 'Chicago', country: 'United States', tz: 'America/Chicago' },
  { city: 'Austin', country: 'United States', tz: 'America/Chicago' },
  { city: 'Denver', country: 'United States', tz: 'America/Denver' },
  { city: 'San Francisco', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'Seattle', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'Los Angeles', country: 'United States', tz: 'America/Los_Angeles' },
  { city: 'Toronto', country: 'Canada', tz: 'America/Toronto' },
  { city: 'Honolulu', country: 'United States', tz: 'Pacific/Honolulu' },
  { city: 'Mexico City', country: 'Mexico', tz: 'America/Mexico_City' },
  { city: 'São Paulo', country: 'Brazil', tz: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', country: 'Argentina', tz: 'America/Argentina/Buenos_Aires' },
  { city: 'Bogotá', country: 'Colombia', tz: 'America/Bogota' },
  { city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney' },
  { city: 'Melbourne', country: 'Australia', tz: 'Australia/Melbourne' },
  { city: 'Auckland', country: 'New Zealand', tz: 'Pacific/Auckland' },
]

export type LocationKind = 'ip' | 'gps'

export function formatLocation(p: { city: string; country: string }, kind: LocationKind): string {
  return `${p.city}, ${p.country} (${kind === 'gps' ? 'GPS Precise Location' : 'IP Approximate'})`
}

/** The zone of a shuffled location, when it came from PLACES. */
export function zoneOfLocation(location: string): string | null {
  const m = /^(.+?), (.+) \((?:IP Approximate|GPS Precise Location)\)$/.exec(location)
  if (!m) return null
  return PLACES.find((p) => p.city === m[1] && p.country === m[2])?.tz ?? null
}

const pick = <T,>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)]

function weighted<T>(entries: readonly (readonly [T, number])[], rng: Rng): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of entries) if ((r -= w) < 0) return v
  return entries[entries.length - 1][0]
}

/** A place, as a user's browser would have named it. IP-based is the default in
 *  production (GPS needs a permission prompt), so it is the likelier one. A small
 *  share of users have no location at all. */
export function randomPlace(rng: Rng = Math.random): { location: string; tz: string | null } {
  if (rng() < 0.08) return { location: '', tz: null }
  const place = pick(PLACES, rng)
  return { location: formatLocation(place, rng() < 0.2 ? 'gps' : 'ip'), tz: place.tz }
}

export function randomLanguage(rng: Rng = Math.random): Language | '' {
  return weighted<Language | ''>(
    [['', 40], ['en', 22], ['zh-CN', 18], ['zh-TW', 5], ['ja', 8], ['ko', 7]],
    rng,
  )
}

/** A clock for `location`'s zone (or, with no known zone, at `fallbackOffset`). */
export function randomDatetime(
  opts: { location: string; fallbackOffset: number; range: TimeRange },
  rng: Rng = Math.random,
  now: number = Date.now(),
): string {
  const ms = randomInstant(opts.range, rng, now)
  const tz = zoneOfLocation(opts.location)
  return isoAtOffset(ms, tz ? zoneOffsetMinutes(tz, ms) : opts.fallbackOffset)
}

// ── memory ──────────────────────────────────────────────────────────────────

// Written in the shape the memory curator produces (core/memories_update_llm.py):
// short markdown sections — Profile / Preferences / Current Focus — merged, no
// secrets, well under the 3000-character cap. Invented people; none is real.
export const MEMORY_SAMPLES: string[] = [
  `## Profile
- Backend engineer at a logistics startup; works mostly in Go and Postgres
- Based in Austin, TX; works with a team spread across US time zones

## Preferences
- Wants the short answer first, then detail only if asked
- Prefers code examples over prose explanations

## Current Focus
- Cutting p99 latency on an order-routing service`,
  `## Profile
- 大三学生，学习计算机科学，住在杭州
- 正在准备考研，目标是人工智能方向

## Preferences
- 喜欢分步骤的讲解，并配一个小例子
- 回答请用中文，专业术语保留英文

## Current Focus
- 复习线性代数和概率论，每周日做一套模拟题`,
  `## Profile
- High-school chemistry teacher in Manchester, UK
- Two kids (8 and 11)

## Preferences
- Uses metric units and British spelling
- Likes analogies a twelve-year-old would follow

## Current Focus
- Building a Year 10 unit on reaction rates and a revision quiz for it`,
  `## Profile
- 小さなカフェを経営している(東京・吉祥寺)
- 一人で仕組みを回しているので時間がない

## Preferences
- 丁寧だが簡潔な日本語で答えてほしい
- 手順は箇条書きで

## Current Focus
- 在庫管理と原価計算をスプレッドシートで自動化したい`,
  `## Profile
- Product designer, 6 years in fintech; lives in Berlin
- Reads English and German

## Preferences
- Dislikes filler and hedging; wants a direct recommendation with trade-offs
- Prefers sources linked inline

## Current Focus
- Redesigning onboarding for a mobile banking app`,
  `## Profile
- 서울에 사는 30대 직장인, 마케팅 팀에서 일함
- 주말에는 러닝 크루 활동

## Preferences
- 친근하지만 정중한 한국어로 답변
- 숫자와 근거를 함께 제시

## Current Focus
- 하프 마라톤 완주를 목표로 12주 훈련 계획 짜는 중`,
  `## Profile
- Retired civil engineer, 68, lives in Vancouver
- Comfortable with technology but not with jargon

## Preferences
- Explain acronyms the first time they appear
- Imperial and metric both, if they differ

## Current Focus
- Planning a three-week trip through Portugal in the spring
- Learning basic Portuguese`,
  `## Profile
- PhD student in computational biology, Boston
- Uses Python (pandas, scikit-learn) daily

## Preferences
- Cite papers with year; flag when evidence is weak or contested
- Prefers LaTeX for equations

## Current Focus
- Single-cell RNA-seq batch-effect correction; comparing Harmony and scVI`,
  `## Profile
- 台北的自由接案設計師，主要做品牌與包裝

## Preferences
- 繁體中文，語氣自然不要太官腔
- 希望先給結論，再列理由

## Current Focus
- 為一間手沖咖啡品牌規劃新年度的視覺系統`,
  `## Profile
- Founder of a two-person SaaS company, Singapore
- Non-native English speaker; writes clearly but asks for polish

## Preferences
- Keep emails warm and professional, under 150 words
- Wants subject-line options

## Current Focus
- Closing the first enterprise pilot; drafting follow-ups and a pricing page`,
  `## Profile
- Nurse practitioner, night shifts, Chicago

## Preferences
- Practical, evidence-based; says when something needs a clinician's judgement
- Short paragraphs; she reads on her phone

## Current Focus
- Sleep schedule recovery between night shifts
- Studying for a certification exam in June`,
]

/** Memory for a shuffled conversation: most users have none stored yet. */
export function randomMemory(rng: Rng = Math.random): string {
  return rng() < 0.4 ? '' : pick(MEMORY_SAMPLES, rng)
}

// ── whole-form shuffle ──────────────────────────────────────────────────────

/** Re-roll the unlocked fields. The clock follows the place: if the location is
 *  re-rolled the datetime is drawn in its zone, and if only the datetime is re-rolled
 *  it is drawn in the current location's zone (or keeps the current offset). */
export function shuffleFields(
  current: CollectorFields,
  locked: Partial<Record<FieldKey, boolean>>,
  opts: { range: TimeRange; memoryAllowed: boolean },
  rng: Rng = Math.random,
  now: number = Date.now(),
): CollectorFields {
  const next = { ...current }
  if (!locked.location) next.location = randomPlace(rng).location
  if (!locked.language) next.language = randomLanguage(rng)
  if (!locked.memory && opts.memoryAllowed) next.memory = randomMemory(rng)
  if (!locked.datetime) {
    next.datetime = randomDatetime(
      { location: next.location, fallbackOffset: offsetOfIso(current.datetime) ?? 0, range: opts.range },
      rng,
      now,
    )
  }
  return next
}

/** What the page starts with: "now", here, auto language, no memory. */
export function defaultFields(now: number = Date.now()): CollectorFields {
  const offset = -new Date(now).getTimezoneOffset()
  return { datetime: isoAtOffset(now, offset), location: '', language: '', memory: '' }
}

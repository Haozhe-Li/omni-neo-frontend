// Scheduled research runs on QStash, whose cron scheduler is UTC-only — these
// helpers convert between what the user picks (a local time, in their own
// timezone) and the UTC cron string QStash actually needs, and back again for
// editing. The conversion is computed once at save time using the browser's
// current UTC offset; a DST transition after that point shifts the actual
// fire time by an hour until the schedule is re-saved — an accepted MVP
// limitation given QStash's SDK has no IANA timezone parameter.

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly'

export interface ScheduleConfig {
    frequency: ScheduleFrequency
    time: string // "HH:MM", 24h, local time
    weekday?: number // 0 (Sunday) – 6 (Saturday), required when frequency === 'weekly'
    dayOfMonth?: number // 1–28, required when frequency === 'monthly' (capped to 28 so it exists in every month)
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function pad(n: number): string {
    return String(n).padStart(2, '0')
}

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Local ScheduleConfig -> UTC cron string ("MM HH * * *", "MM HH * * D", or "MM HH D * *"). */
export function buildCron(config: ScheduleConfig): string {
    const [hourStr, minuteStr] = config.time.split(':')
    const hour = parseInt(hourStr, 10)
    const minute = parseInt(minuteStr, 10)

    const now = new Date()

    if (config.frequency === 'weekly') {
        const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
        const targetWeekday = config.weekday ?? local.getDay()
        // Shift the reference date so its local weekday actually matches the
        // one the user picked, before reading off the equivalent UTC fields —
        // the local/UTC weekday relationship depends on which day it is.
        const diff = (targetWeekday - local.getDay() + 7) % 7
        local.setDate(local.getDate() + diff)
        return `${local.getUTCMinutes()} ${local.getUTCHours()} * * ${local.getUTCDay()}`
    }

    if (config.frequency === 'monthly') {
        const dayOfMonth = config.dayOfMonth ?? 1
        const local = new Date(now.getFullYear(), now.getMonth(), dayOfMonth, hour, minute, 0, 0)
        return `${local.getUTCMinutes()} ${local.getUTCHours()} ${local.getUTCDate()} * *`
    }

    const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
    return `${local.getUTCMinutes()} ${local.getUTCHours()} * * *`
}

/** UTC cron string -> local ScheduleConfig, for prefilling the edit form. Returns
 * null if the cron isn't one buildCron() could have produced (unsupported shape). */
export function parseCron(cron: string): ScheduleConfig | null {
    const parts = cron.trim().split(/\s+/)
    if (parts.length !== 5) return null
    const [minute, hour, dom, month, dow] = parts
    if (month !== '*') return null

    const utcMinute = parseInt(minute, 10)
    const utcHour = parseInt(hour, 10)
    if (Number.isNaN(utcMinute) || Number.isNaN(utcHour)) return null

    const now = new Date()

    if (dom !== '*' && dow === '*') {
        const utcDom = parseInt(dom, 10)
        if (Number.isNaN(utcDom)) return null
        const utcRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), utcDom, utcHour, utcMinute))
        const time = `${pad(utcRef.getHours())}:${pad(utcRef.getMinutes())}`
        return { frequency: 'monthly', time, dayOfMonth: utcRef.getDate() }
    }

    if (dom !== '*' || (dow !== '*' && Number.isNaN(parseInt(dow, 10)))) return null

    const utcRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour, utcMinute))
    const time = `${pad(utcRef.getHours())}:${pad(utcRef.getMinutes())}`

    if (dow === '*') {
        return { frequency: 'daily', time }
    }

    const utcWeekday = parseInt(dow, 10)
    // Fixed local/UTC day offset for this instant (at most ±1, timezone-driven).
    const dayDelta = utcRef.getDay() - utcRef.getUTCDay()
    const localWeekday = (utcWeekday + dayDelta + 7) % 7
    return { frequency: 'weekly', time, weekday: localWeekday }
}

/** Human-readable summary of a ScheduleConfig, e.g. "Daily at 9:00 AM",
 * "Weekly on Monday at 9:00 AM", or "Monthly on the 1st at 9:00 AM". */
export function formatScheduleLabel(config: ScheduleConfig): string {
    const [h, m] = config.time.split(':').map(Number)
    const displayTime = new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (config.frequency === 'weekly') {
        return `Weekly on ${WEEKDAY_LABELS[config.weekday ?? 0]} at ${displayTime}`
    }
    if (config.frequency === 'monthly') {
        return `Monthly on the ${ordinal(config.dayOfMonth ?? 1)} at ${displayTime}`
    }
    return `Daily at ${displayTime}`
}

/** Convenience: parse a stored cron string straight to a display label. */
export function formatScheduleLabelFromCron(cron: string): string {
    const config = parseCron(cron)
    return config ? formatScheduleLabel(config) : cron
}

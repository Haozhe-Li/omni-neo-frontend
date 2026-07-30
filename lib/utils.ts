import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalISOString() {
  const d = new Date()
  const pad = (n: number) => (n < 10 ? '0' + n : n)
  const tzo = -d.getTimezoneOffset()
  const dif = tzo >= 0 ? '+' : '-'
  const offH = pad(Math.floor(Math.abs(tzo) / 60))
  const offM = pad(Math.abs(tzo) % 60)

  return d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) +
    ':' + pad(d.getMinutes()) +
    ':' + pad(d.getSeconds()) +
    dif + offH + ':' + offM
}

export function getAiRequestErrorMessage(status: number) {
  if (status === 401) return '未检测到身份凭证，请先登录后重试。'
  if (status === 403) return '无权访问该会话内容。'
  if (status === 429) return '今日使用额度已用完，请稍后再试。'
  return '请求失败，请稍后重试。'
}

/**
 * If `res` is a 429 carrying our structured usage_limit_exceeded body,
 * dispatch the `omni:usage-limit` window event (see usage-limit-dialog.tsx)
 * and return true so the caller can skip its generic error toast. Returns
 * false for any other status or body shape, leaving `res`'s body unread.
 */
export async function handleUsageLimitResponse(res: Response): Promise<boolean> {
  if (res.status !== 429) return false
  try {
    const body = await res.json()
    const detail = body?.detail
    if (!detail || detail.error !== 'usage_limit_exceeded') return false
    window.dispatchEvent(new CustomEvent('omni:usage-limit', {
      detail: {
        scope: detail.scope,
        isGuest: detail.is_guest,
        dayUsed: detail.day_used,
        dayLimit: detail.day_limit,
        monthUsed: detail.month_used,
        monthLimit: detail.month_limit,
        resetsDayAt: detail.resets_day_at,
        resetsMonthAt: detail.resets_month_at,
      },
    }))
    return true
  } catch {
    return false
  }
}

/**
 * If `res` is a 403 carrying the backend's structured thread_locked body
 * (core/routers/chat.py's `_thread_locked_detail`), return its message so the
 * caller can flip local lock state and show it instead of the generic 403
 * copy. This is a defense-in-depth path — normally the composer is already
 * disabled before this request fires (see chat-view.tsx's `isLocked`); this
 * only matters for a race (e.g. another tab's turn locked the thread after
 * this one loaded). Returns null for any other status/body shape, leaving
 * `res`'s body unread.
 */
export async function parseThreadLockedResponse(res: Response): Promise<{ reason?: string; message: string } | null> {
  if (res.status !== 403) return null
  try {
    const body = await res.json()
    const detail = body?.detail
    if (!detail || detail.error !== 'thread_locked') return null
    return { reason: detail.reason, message: detail.message || 'This conversation has been locked.' }
  } catch {
    return null
  }
}

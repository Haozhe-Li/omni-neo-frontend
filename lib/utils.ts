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
  if (status === 429) return '今日免费使用次数已用完，登录后可无限使用。'
  return '请求失败，请稍后重试。'
}

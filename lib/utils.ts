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

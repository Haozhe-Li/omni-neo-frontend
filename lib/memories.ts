// Memory content itself now lives server-side (Postgres, keyed by user_id) and
// is extracted automatically by the backend after each turn — see
// hooks/useMemory.ts for reading/clearing it. This file only tracks the
// client-side on/off preference sent as `personalization.memory_enabled`.

const STORAGE_KEY = 'omni_enable_memories'

export const isMemoryEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export const setMemoryEnabled = (value: boolean): void => {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, value.toString())
}

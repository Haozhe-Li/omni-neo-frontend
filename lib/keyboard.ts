import type React from 'react'

type EnterSubmitOptions = {
  isMenuOpen?: boolean
}

export const isComposingKeyboardEvent = (
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
) => {
  const nativeEvent = e.nativeEvent as KeyboardEvent & {
    isComposing?: boolean
    keyCode?: number
  }
  return Boolean(nativeEvent.isComposing) || nativeEvent.keyCode === 229
}

export const shouldSubmitOnEnter = (
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  options: EnterSubmitOptions = {}
) => {
  if (e.key !== 'Enter') return false
  if (isComposingKeyboardEvent(e)) return false
  if (options.isMenuOpen) return false
  if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false
  return true
}

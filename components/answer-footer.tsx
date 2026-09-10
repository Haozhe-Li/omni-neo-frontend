'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Share2, ThumbsUp, ThumbsDown, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { CHAT_MODELS, getModel, type ChatModelId } from '@/lib/models'

function IconBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick?: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-full p-1.5 transition-all duration-150 active:scale-95 hover:bg-[var(--sand)] ${
        active ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'
      }`}
    >
      {children}
    </button>
  )
}

interface AnswerFooterProps {
  content: string
  onRegenerate?: (model: ChatModelId) => void
  regeneratedWith?: ChatModelId
  /** Guests can't regenerate on a signed-in-only model — those rows are hidden
   *  rather than shown locked, since this menu is an action list, not a picker. */
  isSignedIn?: boolean
}

export function AnswerFooter({ content, onRegenerate, regeneratedWith, isSignedIn = false }: AnswerFooterProps) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const regenRef = useRef<HTMLDivElement>(null)
  // Close regen dropdown on outside click
  useEffect(() => {
    if (!regenOpen) return
    const handler = (e: MouseEvent) => {
      if (regenRef.current && !regenRef.current.contains(e.target as Node)) {
        setRegenOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [regenOpen])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleLike = () => { setLiked(true); setDisliked(false) }
  const handleDislike = () => { setDisliked(true); setLiked(false) }

  return (
    /* A hairline over the action row rather than a card around it: the
       footer belongs to the answer above it, and boxing it would make the
       turn look like it ended twice. */
    <div className="mt-7 border-t border-[var(--line)] pt-2">
      {regeneratedWith && (
        <p className="mb-1 pt-1 text-[11.5px] text-[var(--ink-faint)] select-none">
          Regenerated with {getModel(regeneratedWith).label}
        </p>
      )}
      <div className="flex items-center gap-1">
        <IconBtn onClick={handleCopy} title="Copy">
          {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </IconBtn>
        <IconBtn title="Share">
          <Share2 size={16} strokeWidth={1.75} />
        </IconBtn>

        {/* Regenerate — available on any assistant message; the caller
            (chat-view) confirms with the user first if this isn't the last
            one, since redoing an earlier turn discards everything after it. */}
        {onRegenerate && (
          <div className="relative" ref={regenRef}>
            <IconBtn onClick={() => setRegenOpen((v) => !v)} title="Regenerate">
              <RotateCcw size={16} strokeWidth={1.75} />
            </IconBtn>
            {regenOpen && (
              <div className="absolute left-0 bottom-full z-50 mb-2 w-52 rounded-[18px] border border-[var(--line-strong)] bg-[var(--paper-raised)] py-2 shadow-[0_22px_50px_-30px_color-mix(in_srgb,var(--ink)_60%,transparent)] animate-in fade-in slide-in-from-bottom-2 duration-150">
                <p className="omni-eyebrow px-3.5 pb-2 pt-1">Regenerate with</p>
                {CHAT_MODELS.filter((m) => isSignedIn || !m.requiresAuth).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setRegenOpen(false); onRegenerate(m.id) }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--sand)]"
                  >
                    <div>
                      <div className="mb-0.5 text-[13.5px] leading-none text-[var(--ink)]">{m.label}</div>
                      <div className="text-[11.5px] text-[var(--ink-muted)]">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <IconBtn onClick={handleLike} active={liked} title="Good response">
            <ThumbsUp size={16} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
          </IconBtn>
          <IconBtn onClick={handleDislike} active={disliked} title="Bad response">
            <ThumbsDown size={16} strokeWidth={1.75} fill={disliked ? 'currentColor' : 'none'} />
          </IconBtn>
        </div>
      </div>
    </div>
  )
}

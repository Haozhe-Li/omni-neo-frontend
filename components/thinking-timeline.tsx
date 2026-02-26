'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search,
  FileText,
  BookOpen,
  ShieldCheck,
  Code,
  MoreHorizontal,
  Play,
  Brain,
  Lightbulb,
  Sparkles,
  AlertTriangle,
  Terminal,
  LineChart,
} from 'lucide-react'
import type { SSEMessage } from '@/lib/types'

interface ThinkingTimelineProps {
  messages: SSEMessage[]
  isStreaming: boolean
  isComplete?: boolean
}

export function ThinkingTimeline({
  messages,
  isStreaming,
  isComplete,
}: ThinkingTimelineProps) {
  /* ── Better Auto-Scrolling Logic ── */
  const scrollRef = useRef<HTMLDivElement>(null)
  const userHasScrolledRef = useRef(false)
  const isAutoScrolling = useRef(false)

  // 1. Scroll to bottom when new content arrives (unless user scrolled up)
  useEffect(() => {
    // Only auto-scroll if we are streaming/loading and user hasn't scrolled up
    if (scrollRef.current && !userHasScrolledRef.current) {

      // Mark that we are programmatically scrolling
      isAutoScrolling.current = true

      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }
        // Reset the flag after animation finishes (~300ms for smooth scroll)
        setTimeout(() => {
          isAutoScrolling.current = false
        }, 300)
      })
    }
  }, [messages]) // Trigger on new messages

  // 2. Detect user scroll interactions
  const handleScroll = () => {
    // Ignore scroll events triggered by our auto-scroll logic
    if (isAutoScrolling.current) return
    if (!scrollRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current

    // Check if user is near the bottom (tolerance of 20px)
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 50

    if (isAtBottom) {
      // User is at the bottom -> Resume auto-scroll
      userHasScrolledRef.current = false
    } else {
      // User scrolled up -> Pause auto-scroll
      userHasScrolledRef.current = true
    }
  }

  return (
    <div className="flex flex-col h-full">


      {/* Scrollable timeline container — no vertical line */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative px-1"
      >
        {messages.length === 0 && isStreaming && (
          <div className="animate-fade-up py-2 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-[var(--border-subtle)] animate-pulse" />
                <div className="h-2 rounded-full bg-[var(--border-subtle)]/50 animate-pulse" style={{ width: `${60 - i * 15}%` }} />
              </div>
            ))}
          </div>
        )}
        {messages.length === 0 && isComplete && (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <span>No thinking steps used</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <TimelineItem
              key={idx}
              message={msg}
              isActive={isStreaming && idx === messages.length - 1}
              isComplete={isComplete || (idx < messages.length - 1)}
            />
          ))}
        </div>

        {/* Loading Block Animation - pushes latest step up into view */}
        {isStreaming && <ThinkingBlockLoader />}
      </div>
    </div>
  )
}



/* ── Individual timeline item — icon-based, no dots or lines ── */
function TimelineItem({ message, isActive, isComplete }: { message: SSEMessage; isActive: boolean; isComplete: boolean }) {
  const [visible, setVisible] = useState(false)

  // Fade-in on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (message.type === 'reasoning') {
    return (
      <div
        className="flex items-start gap-3 transition-all duration-400 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <StatusIcon isActive={isActive} isComplete={isComplete} />
        <ReasoningContent content={typeof message.content === 'string' ? message.content : ''} />
      </div>
    )
  }

  if (message.type === 'tool') {
    return (
      <div
        className="flex items-start gap-3 transition-all duration-400 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        <StatusIcon isActive={isActive} isComplete={isComplete} />
        <ToolContent message={message} />
      </div>
    )
  }

  return null
}

function StatusIcon({ isActive, isComplete }: { isActive: boolean; isComplete: boolean }) {
  if (isActive) {
    return (
      <div className="flex h-4 w-4 shrink-0 items-center justify-center mt-0.5">
        <MoreHorizontal className="h-4 w-4 animate-pulse text-accent" />
      </div>
    )
  }

  // Completed state (or previous items) always check
  return (
    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-2.5 w-2.5 text-muted-foreground"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  )
}

function ReasoningContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = content.slice(0, 80)
  const hasMore = content.length > 80

  return (
    <div className="flex-1 min-w-0 pt-0.5">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {expanded ? content : preview}
        {hasMore && !expanded && '...'}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xs hover:underline cursor-pointer transition-colors"
          >
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </p>
    </div>
  )
}

function ToolContent({ message }: { message: SSEMessage }) {
  const [codeVisible, setCodeVisible] = useState(false)
  const [urlVisible, setUrlVisible] = useState(false)
  const [imageVisible, setImageVisible] = useState(false)
  const tool = message.tool || ''
  const raw = message.raw || {}
  const args = raw.args || {}

  // Recursive search for a data URL, valid image URL, or base64 image
  const findImageUrl = (obj: any, depth = 0): string | null => {
    if (!obj || depth > 5) return null;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:image/')) return obj;
      if (obj.match(/^https?:\/\/.*\.(png|jpg|jpeg|gif|svg|webp)$/i)) return obj;
      // Some LLMs return pure base64 for images in output/result fields
      if (obj.length > 500 && /^[A-Za-z0-9+/=\s]+$/.test(obj)) {
        // Simple heuristic to check if it's base64 and not just random text/code
        const cleanStr = obj.replace(/\s/g, '');
        if (cleanStr.length > 500 && cleanStr.length % 4 === 0 && !cleanStr.includes('def ') && !cleanStr.includes('import ')) {
          return `data:image/png;base64,${cleanStr}`;
        }
      }
    } else if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (['code', 'query', 'fact'].includes(key)) continue;
        const res = findImageUrl(obj[key], depth + 1);
        if (res) return res;
      }
    }
    return null;
  }

  let imageUrl = findImageUrl(raw);
  if (!imageUrl && typeof raw.result === 'string') {
    const mdMatch = raw.result.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch && mdMatch[1]) imageUrl = mdMatch[1];
  } else if (!imageUrl && typeof raw.output === 'string') {
    const mdMatch = raw.output.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch && mdMatch[1]) imageUrl = mdMatch[1];
  }

  const getToolLabel = (): { label: React.ReactNode; detail: React.ReactNode } => {
    switch (tool) {
      case 'google_search':
        return {
          label: 'Searching',
          detail: args.query ? <span className="text-muted-foreground/80">"{args.query}"</span> : null
        }
      case 'skimming_web_pages':
      case 'get_full_text':
        const urls = args.urls || args.url
        const count = Array.isArray(urls) ? urls.length : 1
        return {
          label: tool === 'skimming_web_pages' ? 'Reviewing Sources' : 'Reading Content',
          detail: (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground/80">
                {Array.isArray(urls) ? `${count} page${count > 1 ? 's' : ''}` : (new URL(urls).hostname)}
              </span>
              <button
                onClick={() => setUrlVisible(!urlVisible)}
                className="text-xs underline hover:text-foreground cursor-pointer transition-colors whitespace-nowrap"
              >
                {urlVisible ? 'hide' : 'view'}
              </button>
            </div>
          )
        }
      case 'verify_claim':
        return {
          label: 'Verifying',
          detail: <span className="truncate">{args.fact}</span>
        }
      case 'write_file':
        return {
          label: 'Writing Notes',
          detail: args.file ? <span className="text-muted-foreground/80">{args.file}</span> : null
        }
      case 'read_file':
        return {
          label: 'Reading Notes',
          detail: args.file ? <span className="text-muted-foreground/80">{args.file}</span> : null
        }
      case 'edit_file':
        return {
          label: 'Updating Notes',
          detail: args.file ? <span className="text-muted-foreground/80">{args.file}</span> : null
        }
      case 'run_python_tool':
        return {
          label: 'Running Code',
          detail: (
            <div className="flex items-center gap-2">
              <button onClick={() => setCodeVisible(!codeVisible)} className="text-xs underline hover:text-foreground cursor-pointer transition-colors whitespace-nowrap ml-2">
                {codeVisible ? 'hide code' : 'view code'}
              </button>
              {imageUrl && (
                <button onClick={() => setImageVisible(!imageVisible)} className="text-xs underline text-accent hover:text-accent/80 cursor-pointer transition-colors whitespace-nowrap">
                  {imageVisible ? 'hide image' : 'view image'}
                </button>
              )}
            </div>
          ),
        }
      case 'draw_graph':
        return {
          label: 'Drawing Graph',
          detail: (
            <div className="flex items-center gap-2">
              <button onClick={() => setCodeVisible(!codeVisible)} className="text-xs underline hover:text-foreground cursor-pointer transition-colors whitespace-nowrap ml-2">
                {codeVisible ? 'hide code' : 'view code'}
              </button>
              {imageUrl && (
                <button onClick={() => setImageVisible(!imageVisible)} className="text-xs underline text-accent hover:text-accent/80 cursor-pointer transition-colors whitespace-nowrap">
                  {imageVisible ? 'hide image' : 'view image'}
                </button>
              )}
            </div>
          ),
        }
      case 'get_history_trend':
        return {
          label: 'Analyzing Stock Trend',
          detail: (args.symbol || args.query) ? <span className="text-muted-foreground/80">"{args.symbol || args.query}"</span> : null
        }
      case 'get_stock_data':
        return {
          label: 'Fetching Real-time Stock Data',
          detail: (args.symbol || args.query) ? <span className="text-muted-foreground/80">"{args.symbol || args.query}"</span> : null
        }
      default:
        return {
          label: tool,
          detail: null,
        }
    }
  }

  const { label, detail } = getToolLabel()

  return (
    <div className="flex-1 min-w-0 pt-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
        <span className="font-medium">{label}</span>
        {detail}
      </div>
      {codeVisible && args.code && (
        <pre className="mt-2 rounded-lg bg-secondary/50 p-3 text-xs font-mono overflow-x-auto text-foreground border border-border/50">
          <code>{args.code}</code>
        </pre>
      )}
      {imageUrl && (imageVisible || !codeVisible) && ( // show image dynamically or if code is hidden and image exists, wait let's use imageVisible default false? Actually users probably WANT to see it.
        // Let's default imageVisible to false but we added a button.
        // Let's actually always show the image if imageVisible is toggled
        // Wait, if it just generated, maybe auto-show it!
        null
      )}
      {imageUrl && (imageVisible || tool === 'draw_graph') && (
        <div className="mt-3 relative rounded-lg border border-border/50 overflow-hidden bg-white/5 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Generated from tool" className="max-w-full h-auto rounded object-contain mx-auto max-h-[300px]" />
        </div>
      )}
      {urlVisible && (args.urls || args.url) && (
        <div className="mt-2 flex flex-col gap-1 rounded-lg bg-secondary/50 p-3 text-xs border border-border/50">
          {[].concat(args.urls || args.url).map((url: string, i: number) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground hover:underline truncate block"
            >
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function ThinkingBlockLoader() {
  return (
    <div className="flex flex-col gap-2 mt-4 px-1 opacity-50">
      <div className="h-4 w-3/4 bg-muted/60 rounded animate-pulse" />
      <div className="h-4 w-1/2 bg-muted/60 rounded animate-pulse delay-150" />
    </div>
  )
}

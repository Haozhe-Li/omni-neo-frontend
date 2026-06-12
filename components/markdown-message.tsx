'use client'

import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { Copy, Check, Download, BarChart3 } from 'lucide-react'
import { Mermaid } from '@/components/mermaid'
import { EChartsChart } from '@/components/echarts-chart'
import { preprocessMarkdown } from '@/lib/markdown'

// Renders an ```echarts fenced block inline. While the block is still streaming
// in, its JSON is incomplete and won't parse — show a placeholder until it does.
function InlineEcharts({ source }: { source: string }) {
  let option: any = null
  try {
    option = JSON.parse(source.trim())
  } catch {
    option = null
  }
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    return (
      <div className="my-4 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 text-[13px] text-[var(--muted-foreground)]">
        <BarChart3 size={15} strokeWidth={1.75} className="animate-pulse" />
        Rendering chart…
      </div>
    )
  }
  return (
    <div className="my-4 h-[360px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] p-2">
      <EChartsChart option={option} />
    </div>
  )
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractNodeText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(getText().trim())
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] transition-all opacity-0 group-hover:opacity-100"
      title="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// Faithful port of the original answer styling: 16px body, leading-[1.8],
// accent links, mermaid + code copy. Kept identical so the new chat reads the
// same as the legacy canvas/light answers.
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline underline-offset-2 decoration-accent/40 transition-colors">
      {children}
    </a>
  ),
  pre: ({ children }: any) => {
    const cls = children?.props?.className || ''
    if (cls.includes('language-mermaid') || cls.includes('language-echarts')) return <>{children}</>
    const match = /language-(\w+)/.exec(cls)
    const language = match ? match[1] : ''
    return (
      <div className="relative group my-4 rounded-xl border border-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] bg-[color-mix(in_srgb,var(--foreground)_4%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-2 pb-0">
          {language ? (
            <span className="px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))] rounded-md lowercase select-none">
              {language}
            </span>
          ) : <span />}
          <CopyButton getText={() => extractNodeText(children)} />
        </div>
        <pre className="px-4 pb-4 pt-2 overflow-x-auto text-[13px] leading-relaxed custom-scrollbar">
          {children}
        </pre>
      </div>
    )
  },
  code: ({ className, children, ...props }) => {
    if (className?.includes('language-mermaid')) return <Mermaid chart={String(children).replace(/\n$/, '')} />
    if (className?.includes('language-echarts')) return <InlineEcharts source={String(children)} />
    if (!className) {
      return (
        <code className="bg-secondary px-1.5 py-0.5 rounded text-[13px] font-mono text-accent" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={`${className || ''} text-[13px] leading-relaxed`} {...props}>
        {children}
      </code>
    )
  },
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50 border-b border-border">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2.5 text-left font-medium text-foreground text-xs uppercase tracking-wider">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5 text-foreground border-b border-border/50">{children}</td>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-3 border-accent/50 bg-accent/5 rounded-r-lg pl-4 pr-3 py-3 text-muted-foreground italic">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />,
  h1: ({ children }) => <h1 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-4 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold tracking-tight text-foreground mt-8 mb-3 pb-2 border-b border-border/50">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-medium text-foreground mt-6 mb-2">{children}</h3>,
  ul: ({ children }) => <ul className="my-3 ml-1 space-y-1.5 list-disc list-inside">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-1 space-y-1.5 list-decimal list-inside">{children}</ol>,
  li: ({ children }) => <li className="text-foreground leading-[1.7]">{children}</li>,
  p: ({ children }) => <p className="text-foreground leading-[1.8] mb-4 text-pretty">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
  img: ({ src, alt, ...props }) => (
    <figure className="my-6 w-full sm:w-fit sm:max-w-[80%] mx-auto flex flex-col items-center gap-2">
      <div className="group relative rounded-lg overflow-hidden w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src as string} alt={alt || 'Image'} className="w-full h-auto object-contain max-h-[500px]" loading="lazy" {...props} />
        <a href={src as string} target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity" title="Open image">
          <Download className="w-4 h-4" />
        </a>
      </div>
      {alt && <figcaption className="text-[13px] text-muted-foreground/80 text-center px-4">{alt}</figcaption>}
    </figure>
  ),
}

interface MarkdownMessageProps {
  content: string
  className?: string
}

/** GitHub-flavoured Markdown renderer matching the original answer styling. */
export const MarkdownMessage = memo(function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  return (
    <div className={`text-[16px] text-foreground break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
        components={markdownComponents}
      >
        {preprocessMarkdown(content)}
      </ReactMarkdown>
    </div>
  )
})

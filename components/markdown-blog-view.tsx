"use client"

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import type { Components } from 'react-markdown'
import { Mermaid } from '@/components/mermaid'

interface MarkdownBlogViewProps {
  title: string
  markdown: string
  sectionLabel?: string
  excerpt?: string
  coverImage?: string
  author?: string
  publishedAt?: string
  readingTime?: string
  tags?: string[]
}

function extractNodeText(node: ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractNodeText).join('')
  if (typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return extractNodeText(withProps.props?.children)
  }
  return ''
}

function CodeCopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const text = getText().trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Code copied')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Failed to copy code')
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/70 bg-background/80 hover:bg-secondary/70 text-muted-foreground hover:text-foreground transition-all text-xs opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy code"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  )
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  pre: ({ children }: any) => {
    if (children?.props?.className?.includes('language-mermaid')) {
      return <>{children}</>
    }
    return (
      <div className="relative group my-6">
        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-card px-4 py-4 text-[13px] leading-relaxed shadow-sm">
          {children}
        </pre>
        <CodeCopyButton getText={() => extractNodeText(children)} />
      </div>
    )
  },
  code: ({ className, children, ...props }) => {
    const isInline = !className

    if (className?.includes('language-mermaid')) {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />
    }

    if (isInline) {
      return (
        <code
          className="rounded-md border border-border/60 bg-secondary/60 px-1.5 py-0.5 text-[0.9em] text-foreground"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="my-6 rounded-r-lg border-l-3 border-accent/70 bg-accent/5 px-4 py-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border/80">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-secondary/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-border/50 px-4 py-3 align-top">{children}</td>,
  hr: () => <hr className="my-10 border-0 border-t border-border/80" />,
}

export function MarkdownBlogView({
  title,
  markdown,
  sectionLabel = 'Blog',
  excerpt,
  coverImage,
  author = 'Omni Knows Team',
  publishedAt,
  readingTime,
  tags = [],
}: MarkdownBlogViewProps) {
  return (
    <div className="blog-shell min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--background)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-opacity duration-200 hover:opacity-90"
          >
            <Image src="/favicon-32x32.png" alt="Omni Knows" width={18} height={18} className="rounded-[4px]" />
            <span className="text-[15px] font-medium tracking-tight">
              <span className="text-foreground">omni</span>{' '}
              <span className="text-accent">knows</span>
            </span>
          </Link>

          <nav className="flex items-center">
            <a
              href="https://omniknows.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-lg border border-border/80 bg-secondary/45 px-3.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-secondary/75"
            >
              Try Omni
            </a>
          </nav>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-6 sm:py-10">
        <article className="mx-auto w-full max-w-[880px] rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm backdrop-blur-sm sm:p-8">
          <header className="border-b border-border/70 pb-6">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{sectionLabel}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
            {excerpt && <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{excerpt}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span>{author}</span>
              {publishedAt && <span>{publishedAt}</span>}
              {readingTime && <span>{readingTime}</span>}
            </div>

            {tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-border/80 bg-secondary/55 px-3 py-1 text-xs text-secondary-foreground">
                    {tag}
                  </li>
                ))}
              </ul>
            )}

            {coverImage && (
              <div className="mt-6 overflow-hidden rounded-xl border border-border/70 bg-secondary/30">
                <img src={coverImage} alt={title} className="h-auto w-full object-cover" loading="lazy" />
              </div>
            )}
          </header>

          <section className="blog-markdown markdown-body pt-7 text-[16px] leading-[1.8] text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          </section>
        </article>
      </main>

      <footer className="mx-auto mt-2 w-full max-w-[1200px] border-t border-border px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground/70">
          <b>Answers generated by AI. Check important info.</b>
          <p>
            © {new Date().getFullYear()}{' '}
            <a
              href="https://omniknows.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Omni Knows
            </a>
            {'. All rights reserved.'}
          </p>
          <p>
            Made with love by{' '}
            <a
              href="https://haozhe.li"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground"
            >
              Haozhe Li
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
'use client'

import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useTheme } from 'next-themes'

export function Mermaid({ chart }: { chart: string }) {
    const [svgStr, setSvgStr] = useState<string>('')
    const [error, setError] = useState(false)
    const { resolvedTheme } = useTheme()
    const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`)

    const preprocessChart = (code: string) => {
        let processed = code
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/【/g, '[')
            .replace(/】/g, ']')
            .replace(/\u2011/g, '-') // Replace Non-Breaking Hyphen with standard hyphen

        // Auto-quote labels that contain parentheses and aren't already quoted
        // This targets patterns like A[text (brackets)] and turns them into A["text (brackets)"]
        processed = processed.replace(/([a-zA-Z0-9_-]+)(\[|\(|\{)([^"\]\)\}]*[\(\)][^"\]\)\}]*)(\]|\)|\})/g, (match, id, open, text, close) => {
            return `${id}${open}"${text}"${close}`
        })

        return processed
    }

    useEffect(() => {
        const isDark = resolvedTheme === 'dark'

        mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'base',
            securityLevel: 'loose',
            // @ts-ignore - mermaid types might be outdated
            suppressError: true,
            themeVariables: isDark ? {
                fontFamily: 'inherit',
                fontSize: '14px',
                primaryColor: '#222323',
                primaryTextColor: '#ffffff',
                primaryBorderColor: '#4a4b4b',
                lineColor: '#6b6b6b',
                secondaryColor: '#2a2b2b',
                tertiaryColor: '#191a1a',
                textColor: '#ffffff',
                actorBkg: '#222323',
                actorBorder: '#4a4b4b',
                actorTextColor: '#ffffff',
                actorLineColor: '#6b6b6b',
                signalColor: '#8b8b8b',
                signalTextColor: '#eaeaef',
                labelBoxBkgColor: '#2a2b2b',
                labelBoxBorderColor: '#4a4b4b',
                labelTextColor: '#ffffff',
                loopTextColor: '#ffffff',
                noteBkgColor: '#2a2b2b',
                noteBorderColor: '#4a4b4b',
                noteTextColor: '#ffffff',
            } : {
                fontFamily: 'inherit',
                fontSize: '14px',
                primaryColor: '#faf9f6',
                primaryTextColor: '#333',
                primaryBorderColor: '#c8d6d4',
                lineColor: '#8ea6a3',
                secondaryColor: '#ebf2f1',
                tertiaryColor: '#f2f0ea',
                textColor: '#333',
                actorBkg: '#fdfcfb',
                actorBorder: '#a9c0bd',
                actorTextColor: '#2d3332',
                actorLineColor: '#d6dedd',
                signalColor: '#5c7a77',
                signalTextColor: '#4a5957',
                labelBoxBkgColor: '#f0f6f5',
                labelBoxBorderColor: '#b4c9c6',
                labelTextColor: '#2d3332',
                loopTextColor: '#2d3332',
                noteBkgColor: '#f9f6ea',
                noteBorderColor: '#dbd6c3',
                noteTextColor: '#4a473d',
            }
        })

        let isMounted = true

        const renderChart = async () => {
            try {
                const processedChart = preprocessChart(chart)
                // We use a try-catch both outside and check for parse errors
                const { svg } = await mermaid.render(idRef.current, processedChart)
                if (isMounted) {
                    setSvgStr(svg)
                    setError(false)
                }
            } catch (e) {
                console.error('Mermaid render error', e)
                if (isMounted) setError(true)

                // Clear the element to prevent mermaid from leaving broken state
                const el = document.getElementById(idRef.current)
                if (el) el.remove()
            }
        }
        renderChart()

        return () => {
            isMounted = true
            // Attempt to clean up any global error messages mermaid might have added
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLElement && (node.id === 'dmermaid' || node.classList.contains('mermaidTooltip'))) {
                            node.remove()
                        }
                    })
                })
            })
            observer.observe(document.body, { childList: true })
            setTimeout(() => observer.disconnect(), 1000)
        }
    }, [chart, resolvedTheme])

    if (error) {
        return (
            <div className="my-4 relative group">
                <pre className="overflow-x-auto rounded-xl bg-[color-mix(in_srgb,var(--foreground)_10%,var(--background))] dark:bg-[color-mix(in_srgb,var(--foreground)_14%,var(--background))] p-4 text-sm leading-relaxed border border-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] dark:border-[color-mix(in_srgb,var(--foreground)_26%,var(--background))]">
                    <code className="text-muted-foreground">{chart}</code>
                </pre>
                <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-500/10 text-[10px] text-red-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Render Error
                </div>
            </div>
        )
    }

    if (!svgStr) {
        return (
            <div className="animate-pulse h-32 bg-secondary/30 border border-border/50 rounded-lg flex items-center justify-center text-sm text-muted-foreground my-4">
                Rendering diagram...
            </div>
        )
    }

    return (
        <div
            className="mermaid-wrapper flex justify-center my-6 overflow-x-auto rounded-xl border border-border/50 p-4 bg-background shadow-sm"
            dangerouslySetInnerHTML={{ __html: svgStr }}
        />
    )
}

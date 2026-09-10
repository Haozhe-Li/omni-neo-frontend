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
        // Ensure code is a string
        const textToProcess = typeof code === 'string' ? code : String(code || '')

        let processed = textToProcess
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
            // Diagrams are drawn as SVG by mermaid's own theming engine, so
            // every value has to be a literal — these mirror the paper palette
            // exactly (see globals.css). Node fills sit on the raised paper,
            // edges and actor lines take the teal so a diagram reads as part
            // of an answer rather than a pasted-in picture, and notes take the
            // sand so an aside is visibly an aside.
            themeVariables: isDark ? {
                fontFamily: 'inherit',
                fontSize: '14px',
                primaryColor: '#201C19',
                primaryTextColor: '#F2EBE0',
                primaryBorderColor: '#40382E',
                lineColor: '#6FB4AF',
                secondaryColor: '#262119',
                tertiaryColor: '#191614',
                textColor: '#DED5C8',
                actorBkg: '#201C19',
                actorBorder: '#27524F',
                actorTextColor: '#F2EBE0',
                actorLineColor: '#40382E',
                signalColor: '#6FB4AF',
                signalTextColor: '#DED5C8',
                labelBoxBkgColor: '#17302F',
                labelBoxBorderColor: '#27524F',
                labelTextColor: '#F2EBE0',
                loopTextColor: '#DED5C8',
                noteBkgColor: '#332116',
                noteBorderColor: '#5A3E2A',
                noteTextColor: '#DED5C8',
            } : {
                fontFamily: 'inherit',
                fontSize: '14px',
                primaryColor: '#FFFDF9',
                primaryTextColor: '#2B2724',
                primaryBorderColor: '#E2D8C9',
                lineColor: '#26696B',
                secondaryColor: '#F1EADC',
                tertiaryColor: '#FAF6EF',
                textColor: '#3A342E',
                actorBkg: '#FFFDF9',
                actorBorder: '#CFE3DE',
                actorTextColor: '#2B2724',
                actorLineColor: '#E2D8C9',
                signalColor: '#26696B',
                signalTextColor: '#5A5247',
                labelBoxBkgColor: '#E4EFEC',
                labelBoxBorderColor: '#CFE3DE',
                labelTextColor: '#2B2724',
                loopTextColor: '#3A342E',
                noteBkgColor: '#F6E7DE',
                noteBorderColor: '#E0C4B2',
                noteTextColor: '#5A5247',
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

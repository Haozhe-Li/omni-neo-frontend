'use client'

import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useTheme } from 'next-themes'

export function Mermaid({ chart }: { chart: string }) {
    const [svgStr, setSvgStr] = useState<string>('')
    const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`)
    const [error, setError] = useState(false)
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        const isDark = resolvedTheme === 'dark'

        mermaid.initialize({
            startOnLoad: false,
            theme: isDark ? 'dark' : 'base',
            securityLevel: 'loose',
            themeVariables: isDark ? {
                fontFamily: 'inherit',
                fontSize: '14px',
                // Dark mode colors matching the app UI
                primaryColor: '#222323',
                primaryTextColor: '#ffffff',
                primaryBorderColor: '#4a4b4b',
                lineColor: '#6b6b6b',
                secondaryColor: '#2a2b2b',
                tertiaryColor: '#191a1a',
                textColor: '#ffffff',
                // Sequence Diagram Specifics
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
                // General Colors (Neutral Base, Muted Cyan)
                primaryColor: '#faf9f6',
                primaryTextColor: '#333',
                primaryBorderColor: '#c8d6d4',
                lineColor: '#8ea6a3',
                secondaryColor: '#ebf2f1',
                tertiaryColor: '#f2f0ea',
                textColor: '#333',
                // Sequence Diagram Specifics
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
                const { svg } = await mermaid.render(idRef.current, chart)
                if (isMounted) {
                    setSvgStr(svg)
                    setError(false)
                }
            } catch (e) {
                console.error('Mermaid render error', e)
                if (isMounted) setError(true)
            }
        }
        renderChart()

        return () => {
            isMounted = false
        }
    }, [chart, resolvedTheme])

    if (error) {
        return (
            <div className="p-4 bg-red-100/10 border border-red-500/20 text-red-500 rounded-md text-sm my-4 text-center">
                Failed to render diagram
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

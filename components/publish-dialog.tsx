'use client'

import React, { useState } from 'react'
import { X, Clock, Calendar, Infinity, Globe, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type PublishDuration = '7d' | '30d' | 'permanent'

interface PublishDialogProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (duration: PublishDuration) => void
    title?: string
}

export function PublishDialog({ isOpen, onClose, onConfirm, title }: PublishDialogProps) {
    const [selected, setSelected] = useState<PublishDuration>('7d')

    if (!isOpen) return null

    const options: { id: PublishDuration; label: string; desc: string; icon: React.ReactNode }[] = [
        {
            id: '7d',
            label: '7 Days',
            desc: 'Link expires in 1 week',
            icon: <Clock className="w-4 h-4" />,
        },
        {
            id: '30d',
            label: '1 Month',
            desc: 'Link expires in 30 days',
            icon: <Calendar className="w-4 h-4" />,
        },
        {
            id: 'permanent',
            label: 'Permanent',
            desc: 'Link never expires',
            icon: <Infinity className="w-4 h-4" />,
        },
    ]

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 dark:bg-black/40 animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-[420px] bg-background border border-border rounded-xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 ease-out shadow-lg">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-semibold text-foreground leading-tight">Publish to Web</h3>
                            <p className="text-[12px] text-muted-foreground">Share your research publicly</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {/* Report title preview */}
                    {title && (
                        <div className="px-3 py-2.5 rounded-lg bg-secondary/40 border border-border/60">
                            <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Report</span>
                            <span className="block text-sm text-foreground font-medium truncate">{title}</span>
                        </div>
                    )}

                    {/* Duration picker */}
                    <div className="space-y-2">
                        <span className="block text-[12px] font-medium text-muted-foreground">Link duration</span>
                        <div className="grid grid-cols-3 gap-2">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setSelected(opt.id)}
                                    className={`
                                        relative flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all duration-150
                                        ${selected === opt.id
                                            ? 'border-accent bg-accent/5 text-foreground'
                                            : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
                                        }
                                    `}
                                >
                                    <span className={`p-1.5 rounded-md transition-colors ${selected === opt.id ? 'bg-accent text-white' : 'bg-secondary'}`}>
                                        {opt.icon}
                                    </span>
                                    <span className="text-[12px] font-semibold leading-tight">{opt.label}</span>
                                    <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
                                    {selected === opt.id && (
                                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Info note */}
                    <p className="text-[11px] text-muted-foreground/70 text-center">
                        Anyone with the link can view this report. Content is stored securely.
                    </p>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5">
                    <Button
                        onClick={() => onConfirm(selected)}
                        className="w-full h-10 rounded-lg bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-colors"
                    >
                        Generate Link
                    </Button>
                </div>
            </div>
        </div>
    )
}

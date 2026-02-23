'use client'

import React, { useState } from 'react'
import { X, Clock, Calendar, Lock, Globe, Check } from 'lucide-react'
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
            icon: <Clock className="w-4 h-4" />
        },
        {
            id: '30d',
            label: '1 Month',
            desc: 'Link expires in 30 days',
            icon: <Calendar className="w-4 h-4" />
        },
        {
            id: 'permanent',
            label: 'Permanent',
            desc: 'Link never expires',
            icon: <Lock className="w-4 h-4" />
        }
    ]

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/40 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-[440px] bg-card border border-border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-300 ease-out">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-accent/10 text-accent">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-[17px] font-semibold text-foreground leading-tight">Publish to Web</h3>
                            <p className="text-[13px] text-muted-foreground mt-0.5">Share your research with the world</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full hover:bg-secondary text-muted-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {title && (
                        <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50">
                            <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Report Title</span>
                            <span className="block text-sm font-medium text-foreground truncate">{title}</span>
                        </div>
                    )}

                    <div className="space-y-3">
                        <span className="block text-[13px] font-medium text-foreground ml-1">Choose Duration</span>
                        <div className="grid gap-3">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setSelected(opt.id)}
                                    className={`
                    w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-200
                    ${selected === opt.id
                                            ? 'bg-accent/5 border-accent ring-1 ring-accent'
                                            : 'bg-card border-border hover:border-muted-foreground/30 hover:bg-secondary/20'
                                        }
                  `}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className={`p-2 rounded-lg ${selected === opt.id ? 'bg-accent text-white' : 'bg-secondary text-muted-foreground'}`}>
                                            {opt.icon}
                                        </div>
                                        <div>
                                            <span className={`block text-sm font-semibold ${selected === opt.id ? 'text-foreground' : 'text-foreground/90'}`}>
                                                {opt.label}
                                            </span>
                                            <span className="block text-xs text-muted-foreground mt-0.5">{opt.desc}</span>
                                        </div>
                                    </div>
                                    {selected === opt.id && (
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white animate-in zoom-in-50 duration-200">
                                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2 text-[11px] text-muted-foreground/60 leading-relaxed text-center px-4">
                        People with the link will be able to view this report. Images will be persisted to permanent storage if needed.
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-2">
                    <Button
                        onClick={() => onConfirm(selected)}
                        className="w-full h-11 rounded-xl bg-accent text-white font-semibold shadow-lg shadow-accent/20 hover:opacity-90 active:scale-[0.98] transition-all"
                    >
                        Generate Link
                    </Button>
                </div>
            </div>
        </div>
    )
}

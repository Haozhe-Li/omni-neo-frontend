'use client'

import { X, Lock } from 'lucide-react'
import { useState, useEffect } from 'react'

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    model: 'canvas' | 'light'
    onModelChange: (model: 'canvas' | 'light') => void
    quotaExceeded?: boolean
}

export function SettingsModal({ isOpen, onClose, model, onModelChange, quotaExceeded = false }: SettingsModalProps) {
    const [localModel, setLocalModel] = useState(model)
    const [isClosing, setIsClosing] = useState(false)

    useEffect(() => {
        setLocalModel(model)
    }, [model])

    const handleClose = () => {
        setIsClosing(true)
        setTimeout(() => {
            onClose()
            setIsClosing(false)
        }, 200)
    }

    const handleSave = () => {
        onModelChange(localModel)
        handleClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
                onClick={handleClose}
            />

            {/* Modal Content */}
            <div
                className={`
            relative w-full max-w-md bg-[var(--background)] dark:bg-[#191A1A] 
            rounded-2xl border border-[var(--border-subtle)] shadow-2xl
            transform transition-all duration-200
            ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
            >
                <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
                    <h2 className="text-lg font-medium text-[var(--foreground)]">Settings</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-full hover:bg-[var(--secondary)] text-[var(--muted-foreground)] transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Model Preference</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => !quotaExceeded && setLocalModel('canvas')}
                                disabled={quotaExceeded}
                                className={`
                    relative p-4 rounded-xl border-2 text-left transition-all duration-200
                    ${quotaExceeded
                                        ? 'opacity-50 cursor-not-allowed border-transparent bg-[var(--secondary)]'
                                        : localModel === 'canvas'
                                            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                            : 'border-transparent bg-[var(--secondary)] hover:bg-[var(--secondary)]/80'
                                    }
                `}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`font-semibold ${quotaExceeded ? 'text-[var(--muted-foreground)]' : localModel === 'canvas' ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>Canvas</span>
                                    {quotaExceeded ? <Lock size={14} className="text-[var(--muted-foreground)]" /> : localModel === 'canvas' && <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />}
                                </div>
                                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                                    {quotaExceeded ? 'Daily quota reached — sign in for unlimited access.' : 'Deep research with thinking steps, source analysis, and a rich canvas interface.'}
                                </p>
                            </button>

                            <button
                                onClick={() => setLocalModel('light')}
                                className={`
                    relative p-4 rounded-xl border-2 text-left transition-all duration-200
                    ${localModel === 'light'
                                        ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                        : 'border-transparent bg-[var(--secondary)] hover:bg-[var(--secondary)]/80'
                                    }
                `}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`font-semibold ${localModel === 'light' ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'}`}>Light</span>
                                    {localModel === 'light' && <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />}
                                </div>
                                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                                    Fast, direct answers in a traditional chat interface without visible reasoning steps.
                                </p>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-[var(--border-subtle)] flex justify-end gap-3">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 rounded-lg transition-opacity shadow-sm"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}

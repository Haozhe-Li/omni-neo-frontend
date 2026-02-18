'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
    ArrowLeft,
    Globe,
    Palette,
    Bot,
    MessageSquare,
    Languages,
    Info,
    ExternalLink,
    ChevronRight,
    Check,
    Sun,
    Moon,
    Monitor,
} from 'lucide-react'

type ModelType = 'auto' | 'canvas' | 'light'
type ThemeType = 'system' | 'dark' | 'light'

const APP_VERSION = '0.2.0'
const APP_NAME = 'Omni Knows Neo'

export default function SettingsPage() {
    const router = useRouter()
    const { theme, setTheme } = useTheme()

    const [chatModel, setChatModel] = useState<ModelType>('auto')
    const [mounted, setMounted] = useState(false)

    // Load saved preferences
    useEffect(() => {
        setMounted(true)
        if (typeof window !== 'undefined') {
            const savedModel = localStorage.getItem('omni_model_preference')
            if (savedModel === 'canvas' || savedModel === 'light' || savedModel === 'auto') {
                setChatModel(savedModel)
            }
        }
    }, [])

    const handleModelChange = (newModel: ModelType) => {
        setChatModel(newModel)
        localStorage.setItem('omni_model_preference', newModel)
    }

    const handleThemeChange = (newTheme: ThemeType) => {
        setTheme(newTheme)
    }

    if (!mounted) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
            {/* Top bar */}
            <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--background)]/80 border-b border-[var(--border-subtle)]">
                <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 -ml-1.5 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors duration-200"
                        aria-label="Go back"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-base font-medium">Settings</h1>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-2xl mx-auto px-6 py-8 space-y-10 pb-24">

                {/* ───────── Appearance ───────── */}
                <section>
                    <SectionHeader icon={<Palette size={16} />} title="Appearance" />

                    <div className="mt-4 space-y-1 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--card)]">
                        {/* Language */}
                        <SettingsRow
                            label="Language"
                            description="Interface display language"
                            icon={<Globe size={16} className="text-[var(--muted-foreground)]" />}
                        >
                            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                                <span>English</span>
                            </div>
                        </SettingsRow>

                        <Divider />

                        {/* Theme */}
                        <SettingsRow
                            label="Theme"
                            description="Choose your preferred appearance"
                            icon={<Sun size={16} className="text-[var(--muted-foreground)]" />}
                        >
                            <ThemePicker
                                value={theme as ThemeType}
                                onChange={handleThemeChange}
                            />
                        </SettingsRow>
                    </div>
                </section>

                {/* ───────── AI ───────── */}
                <section>
                    <SectionHeader icon={<Bot size={16} />} title="AI" />

                    <div className="mt-4 space-y-1 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--card)]">
                        {/* Chat Model */}
                        <SettingsRow
                            label="Chat Model"
                            description="Select how the AI responds to your queries"
                            icon={<MessageSquare size={16} className="text-[var(--muted-foreground)]" />}
                        >
                            <ModelPicker
                                value={chatModel}
                                onChange={handleModelChange}
                            />
                        </SettingsRow>

                        <Divider />

                        {/* Model Language */}
                        <SettingsRow
                            label="Model Language"
                            description="Language the AI uses to respond"
                            icon={<Languages size={16} className="text-[var(--muted-foreground)]" />}
                        >
                            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                                <span>Auto</span>
                            </div>
                        </SettingsRow>
                    </div>
                </section>

                {/* ───────── About ───────── */}
                <section>
                    <SectionHeader icon={<Info size={16} />} title="About" />

                    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--card)]">
                        <div className="p-5 space-y-4">
                            {/* App info */}
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-[var(--secondary)] flex items-center justify-center">
                                    <Bot size={24} className="text-[var(--accent)]" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">{APP_NAME}</p>
                                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                        Version {APP_VERSION}
                                    </p>
                                </div>
                            </div>

                            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                                An advanced AI-powered research agent that thinks, searches, and provides comprehensive answers. Built with care for a seamless research experience.
                            </p>

                            <div className="flex flex-wrap gap-2 pt-1">
                                <AboutLink
                                    href="https://omniknows.xyz"
                                    label="Website"
                                />
                                <AboutLink
                                    href="https://github.com/Haozhe-Li"
                                    label="GitHub"
                                />
                            </div>
                        </div>

                        <Divider />

                        <div className="px-5 py-3 flex items-center justify-between">
                            <span className="text-xs text-[var(--muted-foreground)]">
                                © {new Date().getFullYear()} {APP_NAME}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)] opacity-60">
                                Made with ♥
                            </span>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

/* ════════════════════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {icon}
            {title}
        </div>
    )
}

function SettingsRow({
    label,
    description,
    icon,
    children,
}: {
    label: string
    description?: string
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
                {icon}
                <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                    {description && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{description}</p>
                    )}
                </div>
            </div>
            <div className="flex-shrink-0">{children}</div>
        </div>
    )
}

function Divider() {
    return <div className="mx-5 border-t border-[var(--border-subtle)]" />
}

/* Theme picker — segmented control */
function ThemePicker({
    value,
    onChange,
}: {
    value: ThemeType
    onChange: (v: ThemeType) => void
}) {
    const options: { value: ThemeType; label: string; icon: React.ReactNode }[] = [
        { value: 'light', label: 'Light', icon: <Sun size={14} /> },
        { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
        { value: 'system', label: 'Auto', icon: <Monitor size={14} /> },
    ]

    return (
        <div className="flex items-center rounded-lg bg-[var(--secondary)] p-0.5 gap-0.5">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                        transition-all duration-200
                        ${value === opt.value
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/20'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }
                    `}
                >
                    {opt.icon}
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

/* Model picker — segmented control */
function ModelPicker({
    value,
    onChange,
}: {
    value: ModelType
    onChange: (v: ModelType) => void
}) {
    const options: { value: ModelType; label: string; desc: string }[] = [
        { value: 'auto', label: 'Auto', desc: 'Recommended' },
        { value: 'canvas', label: 'Canvas', desc: 'Deep research' },
        { value: 'light', label: 'Light', desc: 'Fast answers' },
    ]

    return (
        <div className="flex items-center rounded-lg bg-[var(--secondary)] p-0.5 gap-0.5">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                        transition-all duration-200
                        ${value === opt.value
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/20'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }
                    `}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

/* About link pill */
function AboutLink({ href, label }: { href: string; label: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-[var(--secondary)] text-[var(--muted-foreground)]
                hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80
                transition-colors duration-200"
        >
            {label}
            <ExternalLink size={12} />
        </a>
    )
}

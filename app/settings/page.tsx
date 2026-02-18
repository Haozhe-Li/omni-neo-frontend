'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { AppSidebar } from '@/components/app-sidebar'
import {
    Globe,
    Palette,
    Bot,
    MessageSquare,
    Languages,
    Info,
    ExternalLink,
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
    const [activeSection, setActiveSection] = useState('Appearance')

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

    // Scroll spy effect to update activeSection based on scroll position
    useEffect(() => {
        const handleScroll = () => {
            const sections = ['Appearance', 'AI', 'About']
            for (const section of sections) {
                const el = document.getElementById(section)
                if (el) {
                    const rect = el.getBoundingClientRect()
                    // If element is approx in upper half of view
                    if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
                        setActiveSection(section)
                        break
                    }
                }
            }
        }

        // Find the main scroll container
        const main = document.querySelector('main')
        if (main) {
            main.addEventListener('scroll', handleScroll)
            return () => main.removeEventListener('scroll', handleScroll)
        }
    }, [mounted])

    const handleModelChange = (newModel: ModelType) => {
        setChatModel(newModel)
        localStorage.setItem('omni_model_preference', newModel)
    }

    const handleThemeChange = (newTheme: ThemeType) => {
        setTheme(newTheme)
    }

    const scrollToSection = (section: string) => {
        setActiveSection(section)
        const element = document.getElementById(section)
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }

    if (!mounted) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden relative">
            {/* Sidebar with settings variant */}
            <AppSidebar
                variant="settings"
                activeSection={activeSection}
                onSelectSection={scrollToSection}
                className="flex-shrink-0 z-50 relative"
            />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 h-full relative overflow-y-auto bg-[var(--background)]">
                <div className="max-w-3xl mx-auto px-6 py-12 space-y-16 pb-32">

                    <div className="flex flex-col gap-2">
                        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>
                        <p className="text-[var(--muted-foreground)]">Manage your preferences and application settings.</p>
                    </div>

                    {/* ───────── Appearance ───────── */}
                    <section id="Appearance" className="scroll-mt-6">
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
                    <section id="AI" className="scroll-mt-6">
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
                    <section id="About" className="scroll-mt-6">
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

                </div>
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

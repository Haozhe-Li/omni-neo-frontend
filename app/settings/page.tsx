'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { AppSidebar } from '@/components/app-sidebar'
import { useIsMobile } from '@/hooks/use-mobile'
import {
    Globe,
    Palette,
    SlidersHorizontal,
    MessageSquare,
    Languages,
    Info,
    ExternalLink,
    Sun,
    Moon,
    Monitor,
    Check,
    ChevronDown,
    Database,
    Menu,
    BrainCircuit,
    Layout,
    User,
    Waypoints
} from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type ModelType = 'auto' | 'canvas' | 'light'
type ThemeType = 'system' | 'dark' | 'light'

const APP_VERSION = '0.2.0'
const APP_NAME = 'Omni Knows'

export default function SettingsPage() {
    const router = useRouter()
    const { theme, setTheme } = useTheme()

    const [chatModel, setChatModel] = useState<ModelType>('auto')
    const [mounted, setMounted] = useState(false)
    const [activeSection, setActiveSection] = useState('Appearance')

    // Sidebar state
    const isMobileCheck = useIsMobile()
    const isMobile = isMobileCheck === undefined ? true : isMobileCheck
    const [sidebarOpen, setSidebarOpen] = useState(false)

    // Initialize sidebar state based on device
    useEffect(() => {
        if (isMobile) {
            setSidebarOpen(false)
        } else {
            setSidebarOpen(true)
        }
    }, [isMobile])

    const toggleSidebar = useCallback(() => {
        setSidebarOpen(prev => !prev)
    }, [])

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
            const sections = ['Appearance', 'Preference', 'Personalization', 'Data Controls', 'About']
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

    const handleNewChat = useCallback(() => {
        router.push('/')
    }, [router])

    const handleSelectThread = useCallback((threadId: string, query?: string) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('pending_thread_id', threadId)
            if (query) {
                localStorage.setItem('pending_thread_query', query)
            }
        }
        router.push('/')
    }, [router])


    if (!mounted) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden relative">
            {/* Sidebar */}
            <AppSidebar
                className="flex-shrink-0 z-50 relative"
                isOpen={sidebarOpen}
                onToggle={toggleSidebar}
                isMobile={isMobile}
                onNewChat={handleNewChat}
                onSelectThread={handleSelectThread}
            />

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 h-full relative overflow-y-auto bg-[var(--background)] pt-14 md:pt-0">

                {/* Mobile Header */}
                <header className="fixed top-0 left-0 right-0 h-14 border-b border-[var(--border-subtle)] bg-[var(--background)]/80 backdrop-blur-md flex items-center justify-center z-40 md:hidden">
                    <button
                        onClick={toggleSidebar}
                        className="absolute left-4 p-2 -ml-2 rounded-md text-muted-foreground hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                        <Menu size={20} />
                    </button>
                    <span className="font-medium text-sm text-[var(--foreground)] tracking-tight">Settings</span>
                </header>

                <div className="max-w-3xl mx-auto px-6 py-12 space-y-16 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out">

                    <div className="hidden md:flex flex-col gap-2">
                        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>
                        <p className="text-[var(--muted-foreground)]">Manage your preferences and application settings.</p>
                    </div>

                    {/* ───────── Appearance ───────── */}
                    <section id="Appearance" className="scroll-mt-6 space-y-6">
                        <SectionHeader icon={<Palette size={16} />} title="Appearance" />

                        <div className="space-y-6">
                            {/* Theme Picker */}
                            <div className="space-y-3">
                                <Label text="Theme" />
                                <div className="grid grid-cols-3 gap-3">
                                    <ThemeOption
                                        value="system"
                                        label="System"
                                        icon={<Monitor size={20} />}
                                        active={theme === 'system'}
                                        onClick={() => handleThemeChange('system')}
                                    />
                                    <ThemeOption
                                        value="light"
                                        label="Light"
                                        icon={<Sun size={20} />}
                                        active={theme === 'light'}
                                        onClick={() => handleThemeChange('light')}
                                    />
                                    <ThemeOption
                                        value="dark"
                                        label="Dark"
                                        icon={<Moon size={20} />}
                                        active={theme === 'dark'}
                                        onClick={() => handleThemeChange('dark')}
                                    />
                                </div>
                            </div>

                            <div className="h-px bg-[var(--border-subtle)] w-full" />

                            {/* Language */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <Label text="Interface Language" />
                                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-medium tracking-wide uppercase">
                                                Coming Soon
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--muted-foreground)]">Select your preferred language for the UI.</p>
                                    </div>
                                    <Select defaultValue="en">
                                        <SelectTrigger className="w-full sm:w-[180px] bg-[var(--card)] border-[var(--border-subtle)]">
                                            <SelectValue placeholder="Language" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="en">English</SelectItem>
                                            <SelectItem value="zh" disabled>Chinese (Coming Soon)</SelectItem>
                                            <SelectItem value="es" disabled>Spanish (Coming Soon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ───────── Preference ───────── */}
                    <section id="Preference" className="scroll-mt-6 space-y-6">
                        <SectionHeader icon={<SlidersHorizontal size={16} />} title="Preference" />

                        <div className="space-y-6">
                            {/* Chat Model */}
                            <div className="space-y-3">
                                <div className="space-y-0.5">
                                    <Label text="Artificial Intelligence" />
                                    <p className="text-xs text-[var(--muted-foreground)]">Choose the way AI thinks for your conversation.</p>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <ModelOption
                                        value="auto"
                                        title="Smart"
                                        description="Automatically selects the best model for your query."
                                        icon={<Waypoints size={16} />}
                                        active={chatModel === 'auto'}
                                        onClick={() => handleModelChange('auto')}
                                    />
                                    <ModelOption
                                        value="canvas"
                                        title="Canvas"
                                        description="Comprehensive report on Canvas, with multi-step reasoning and deep research."
                                        icon={<Layout size={16} />}
                                        active={chatModel === 'canvas'}
                                        onClick={() => handleModelChange('canvas')}
                                    />
                                    <ModelOption
                                        value="light"
                                        title="Light"
                                        description="Quick, concise answers for simple questions and casual chat."
                                        icon={<MessageSquare size={16} />}
                                        active={chatModel === 'light'}
                                        onClick={() => handleModelChange('light')}
                                    />
                                </div>
                            </div>

                            {/* reasoning effort */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <Label text="Reasoning Effort" />
                                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-medium tracking-wide uppercase">
                                                Coming Soon
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--muted-foreground)]">Control the depth of AI's thinking process.</p>
                                    </div>
                                    <Select defaultValue="auto">
                                        <SelectTrigger className="w-full sm:w-[180px] bg-[var(--card)] border-[var(--border-subtle)]">
                                            <SelectValue placeholder="Reasoning Effort" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">Auto</SelectItem>
                                            <SelectItem value="low" disabled>Low (Coming Soon)</SelectItem>
                                            <SelectItem value="medium" disabled>Medium (Coming Soon)</SelectItem>
                                            <SelectItem value="high" disabled>High (Coming Soon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                        </div>
                    </section>

                    {/* ───────── Personalization ───────── */}
                    <section id="Personalization" className="scroll-mt-6 space-y-6">
                        <SectionHeader icon={<User size={16} />} title="Personalization" />

                        <div className="space-y-6">
                            {/* Response Language */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <Label text="Response Language" />
                                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-medium tracking-wide uppercase">
                                                Coming Soon
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--muted-foreground)]">The language the AI uses to respond.</p>
                                    </div>
                                    <Select defaultValue="auto">
                                        <SelectTrigger className="w-full sm:w-[180px] bg-[var(--card)] border-[var(--border-subtle)]">
                                            <SelectValue placeholder="Language" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="auto">Auto Detect</SelectItem>
                                            <SelectItem value="en" disabled>English (Coming Soon)</SelectItem>
                                            <SelectItem value="zh" disabled>Chinese (Coming Soon)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="h-px bg-[var(--border-subtle)] w-full" />

                            {/* Memory */}
                            <div className="space-y-3">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <Label text="Memory" />
                                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-medium tracking-wide uppercase">
                                            Coming Soon
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--muted-foreground)]">Omni will remember details from your conversations to provide more personalized answers.</p>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] opacity-50 cursor-not-allowed">
                                    <div className="space-y-0.5">
                                        <span className="block text-sm font-medium text-[var(--foreground)]">Enable Memories</span>
                                        <span className="block text-xs text-[var(--muted-foreground)]">Allow Omni to learn from your conversations.</span>
                                    </div>
                                    <div className="w-10 h-6 rounded-full bg-[var(--secondary)]/50 relative border border-[var(--border-subtle)]">
                                        <div className="absolute left-1 top-1 w-3.5 h-3.5 rounded-full bg-[var(--muted-foreground)]/30" />
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--secondary)]/10 flex flex-col items-center justify-center space-y-2 h-28 opacity-60 pointer-events-none">
                                    <User size={20} className="text-[var(--muted-foreground)]" />
                                    <span className="text-xs text-[var(--muted-foreground)] text-center">
                                        Memory features are currently in development.<br />Soon you'll be able to manage what Omni knows about you.
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ───────── Data Controls ───────── */}
                    <section id="Data Controls" className="scroll-mt-6 space-y-6">
                        <SectionHeader icon={<Database size={16} />} title="Data Controls" />

                        <div className="space-y-6">
                            <div className="space-y-3">
                                <Label text="Data Management" />

                                <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] text-xs text-[var(--muted-foreground)] leading-relaxed space-y-4">
                                    <div className="space-y-1">
                                        <p className="text-sm text-[var(--foreground)] font-medium">Your Data Matters</p>
                                        <p>Omni respects your privacy. We process your data thoughtfully and securely to provide you with the best possible chat experience.</p>
                                    </div>

                                    <ul className="space-y-2.5 pl-1.5">
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/50 mt-1.5 flex-shrink-0" />
                                            <p><strong className="text-[var(--foreground)] font-medium">Local & Cloud Storage:</strong> Chat history is stored locally on your device and securely on our cloud servers to ensure seamless continuity across sessions.</p>
                                        </li>
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/50 mt-1.5 flex-shrink-0" />
                                            <p><strong className="text-[var(--foreground)] font-medium">Secure & Private:</strong> Data on our servers is heavily encrypted. We do not sell your personal information to any third parties.</p>
                                        </li>
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/50 mt-1.5 flex-shrink-0" />
                                            <p><strong className="text-[var(--foreground)] font-medium">Memory & Personalization:</strong> Omni will learn from you and remember details from your conversations to provide more personalized answers. You can manage your memory in the settings. All memory and personalization data will be only stored locally</p>
                                        </li>
                                        <li className="flex gap-3">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)]/50 mt-1.5 flex-shrink-0" />
                                            <p><strong className="text-[var(--foreground)] font-medium">Auto-Deletion:</strong> To minimize data footprint, any chat history that remains inactive for 3 days will be automatically and permanently deleted from both our servers and your local storage.</p>
                                        </li>
                                    </ul>
                                </div>

                                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] flex items-center justify-between mt-2">
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium text-[var(--foreground)]">Delete all data</span>
                                        <span className="block text-xs text-[var(--muted-foreground)]">Permanently remove all chat history, memory and personalization data.</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (confirm('Are you sure you want to delete all chat history, memory and personalization data? This action cannot be undone.')) {
                                                localStorage.clear()
                                                window.location.reload()
                                            }
                                        }}
                                        className="px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 text-xs font-medium transition-colors"
                                    >
                                        Delete All
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ───────── About ───────── */}
                    <section id="About" className="scroll-mt-6 space-y-6">
                        <SectionHeader icon={<Info size={16} />} title="About" />

                        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card)] overflow-hidden">
                            <div className="p-6 space-y-5">
                                {/* App info */}
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-[var(--secondary)] flex items-center justify-center shadow-inner overflow-hidden">
                                        <Image
                                            src="/android-chrome-512x512.png"
                                            alt="Omni Knows Logo"
                                            width={56}
                                            height={56}
                                            className="w-full h-full object-cover"
                                            unoptimized
                                        />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-base text-[var(--foreground)]">{APP_NAME}</h3>
                                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                            v{APP_VERSION} • Alpha Build
                                        </p>
                                    </div>
                                </div>

                                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                                    Omni Knows is an advanced AI research assistant designed to help you explore complex topics deeply and efficiently. Built with the next-generation agentic framework.
                                </p>

                                <div className="flex flex-wrap gap-3 pt-2">
                                    <AboutLink
                                        href="https://omniknows.xyz"
                                        label="Website"
                                    />
                                    <AboutLink
                                        href="https://haozhe.li/blog/omniknows-neo"
                                        label="About Omni"
                                    />
                                    <AboutLink
                                        href="https://haozhe.li/blog/omniknows-neo-tech"
                                        label="Tech Behind"
                                    />
                                </div>
                            </div>

                            <div className="bg-[var(--secondary)]/30 px-6 py-4 flex items-center justify-between border-t border-[var(--border-subtle)]">
                                <span className="text-xs text-[var(--muted-foreground)]">
                                    © {new Date().getFullYear()} Omni Knows
                                </span>
                                <span className="text-xs text-[var(--muted-foreground)] opacity-60">
                                    Designed by Haozhe Li
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

function Label({ text }: { text: string }) {
    return <h4 className="text-sm font-medium text-[var(--foreground)]">{text}</h4>
}

function ThemeOption({
    value,
    label,
    icon,
    active,
    onClick
}: {
    value: string
    label: string
    icon: React.ReactNode
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex flex-col items-center justify-center gap-3 p-4 rounded-xl border transition-all duration-300",
                active
                    ? "bg-[var(--card)] border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]"
                    : "bg-[var(--card)] border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/40 hover:bg-[var(--secondary)]/30 text-[var(--muted-foreground)]"
            )}
        >
            <div className={cn(
                "transition-colors duration-300",
                active ? "text-[var(--accent)]" : "text-current"
            )}>
                {icon}
            </div>
            <span className={cn(
                "text-xs font-medium transition-colors duration-300",
                active ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
            )}>
                {label}
            </span>
            {active && (
                <div className="absolute top-3 right-3 text-[var(--accent)] animate-in fade-in zoom-in duration-300">
                    <div className="w-2 h-2 rounded-full bg-current" />
                </div>
            )}
        </button>
    )
}

function ModelOption({
    value,
    title,
    description,
    icon,
    active,
    onClick
}: {
    value: string
    title: string
    description: string
    icon: React.ReactNode
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300",
                active
                    ? "bg-[var(--card)] border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]"
                    : "bg-[var(--card)] border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/40 hover:bg-[var(--secondary)]/30"
            )}
        >
            <div className="flex items-start gap-3 pr-4">
                <div className={cn(
                    "mt-0.5 transition-colors duration-300",
                    active ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"
                )}>
                    {icon}
                </div>
                <div className="space-y-1">
                    <span className={cn(
                        "block text-sm font-medium transition-colors duration-300",
                        active ? "text-[var(--foreground)]" : "text-[var(--foreground)]"
                    )}>
                        {title}
                    </span>
                    <span className="block text-xs text-[var(--muted-foreground)] leading-relaxed">
                        {description}
                    </span>
                </div>
            </div>
            <div className={cn(
                "w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300 flex-shrink-0",
                active
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--muted-foreground)]/40 bg-transparent"
            )}>
                {active && <Check size={12} strokeWidth={3} />}
            </div>
        </button>
    )
}

function AboutLink({ href, label }: { href: string; label: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-[var(--secondary)] text-[var(--muted-foreground)]
                hover:text-[var(--foreground)] hover:bg-[var(--secondary)]/80
                transition-colors duration-200 border border-transparent hover:border-[var(--border-subtle)]"
        >
            {label}
            <ExternalLink size={12} />
        </a>
    )
}

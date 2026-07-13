'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useUser, useAuth, useClerk, SignInButton } from '@clerk/nextjs'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { formatDistanceToNow } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    User,
    Settings2,
    Cpu,
    SlidersHorizontal,
    Database,
    Library,
    History,
    BarChart3,
    Info,
    X,
    LogOut,
    ChevronRight,
    MapPin,
    Navigation,
    RefreshCw,
    Trash2,
    Copy,
    ExternalLink,
    Loader2,
    Zap,
    Telescope,
    Lock,
    Check,
    Search,
    MessageSquare,
    CalendarClock,
    Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { getUserLocation, LocationData } from '@/lib/location'
import { useMemory } from '@/hooks/useMemory'
import { useUsage } from '@/hooks/useUsage'
import { useApi } from '@/hooks/useApi'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { ScheduledResearchSection } from '@/components/scheduled-research-section'

type ModelType = 'fast' | 'pro'

const APP_VERSION = '0.2.0'
const APP_NAME = 'Omni Knows'
const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export type TabId = 'general' | 'model' | 'personalization' | 'data' | 'pages' | 'history' | 'scheduled' | 'usage' | 'about'

// Bidirectional map between the internal TabId and the URL slug used under
// /settings/<slug> (e.g. /settings/scheduled-research) — kept here, next to
// TabId, so the two never drift apart. Consumed by app/settings/[[...tab]]
// (parses the URL into a TabId) and by onTabChange below (writes it back).
export const TAB_SLUGS: Record<TabId, string> = {
    general: 'general',
    model: 'model',
    personalization: 'personalization',
    data: 'data-controls',
    pages: 'my-pages',
    history: 'chat-history',
    scheduled: 'scheduled-research',
    usage: 'usage',
    about: 'about',
}

export const SLUG_TO_TAB: Record<string, TabId> = Object.fromEntries(
    Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab])
) as Record<string, TabId>

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'model', label: 'Model', icon: Cpu },
    { id: 'personalization', label: 'Personalization', icon: SlidersHorizontal },
    { id: 'data', label: 'Data controls', icon: Database },
    { id: 'pages', label: 'My pages', icon: Library },
    { id: 'history', label: 'Chat history', icon: History },
    { id: 'scheduled', label: 'Scheduled Research', icon: CalendarClock },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'about', label: 'About', icon: Info },
]

export function SettingsDialog({
    open,
    onOpenChange,
    initialTab = 'general',
    onTabChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    initialTab?: TabId
    // Optional: called whenever the user switches tabs while the dialog is
    // open. Only the dedicated /settings page wires this up (to keep the URL
    // in sync via router.replace) — dialogs opened as an overlay elsewhere
    // (e.g. AppSidebar's footer button, on top of a chat thread) leave it
    // unset and stay local-state-only, unchanged from before.
    onTabChange?: (tab: TabId) => void
}) {
    const [activeTab, setActiveTab] = useState<TabId>(initialTab)

    // Jump to the requested tab whenever the dialog (re)opens — defaults to
    // 'general' unless the caller asked for a specific one (e.g. the sidebar's
    // "Scheduled" shortcut opens straight into the Scheduled Research tab).
    useEffect(() => {
        if (open) setActiveTab(initialTab)
    }, [open, initialTab])

    const selectTab = useCallback((tab: TabId) => {
        setActiveTab(tab)
        onTabChange?.(tab)
    }, [onTabChange])

    const close = useCallback(() => onOpenChange(false), [onOpenChange])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="bg-black/5 dark:bg-black/40"
                className="p-0 border-0 sm:border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col gap-0
                    w-[100vw] h-[100dvh] max-w-none rounded-none
                    !top-0 !left-0 !translate-x-0 !translate-y-0
                    sm:!top-[50%] sm:!left-[50%] sm:!-translate-x-1/2 sm:!-translate-y-1/2
                    sm:w-[92vw] sm:h-[min(680px,85dvh)] sm:max-w-[900px] sm:rounded-2xl"
            >
                <DialogTitle className="sr-only">Settings</DialogTitle>

                {/* Mobile header */}
                <div className="md:hidden flex items-center justify-between px-4 h-14 border-b border-[var(--border-subtle)] shrink-0">
                    <span className="text-sm font-medium text-[var(--foreground)]">Settings</span>
                    <button
                        onClick={close}
                        className="p-2 -mr-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row">
                    {/* ── Left navigation ── */}
                    <nav className="shrink-0 md:w-52 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] flex flex-col">
                        <div className="hidden md:flex items-center gap-2 px-4 pt-4 pb-2">
                            <button
                                onClick={close}
                                className="p-1.5 -ml-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                                title="Close settings"
                            >
                                <X size={17} />
                            </button>
                            <span className="text-sm font-medium text-[var(--foreground)]">Settings</span>
                        </div>

                        <div className="flex md:flex-col gap-1 p-2 md:p-2.5 overflow-x-auto md:overflow-y-auto custom-scrollbar">
                            {NAV_ITEMS.map(item => {
                                const Icon = item.icon
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => selectTab(item.id)}
                                        className={cn(
                                            'flex items-center gap-2.5 shrink-0 md:w-full px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap transition-colors duration-200',
                                            activeTab === item.id
                                                ? 'bg-[var(--secondary)] text-[var(--foreground)] font-medium'
                                                : 'text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/60 hover:text-[var(--foreground)]'
                                        )}
                                    >
                                        <Icon size={16} className="shrink-0" />
                                        {item.label}
                                    </button>
                                )
                            })}
                        </div>
                    </nav>

                    {/* ── Content pane ── */}
                    <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                        <div className="px-5 py-6 md:px-8 md:py-7">
                            {activeTab === 'general' && <GeneralSection />}
                            {activeTab === 'model' && <ModelSection />}
                            {activeTab === 'personalization' && <PersonalizationSection />}
                            {activeTab === 'data' && <DataControlsSection />}
                            {activeTab === 'pages' && <PagesSection />}
                            {activeTab === 'history' && <ChatHistorySection onClose={close} />}
                            {activeTab === 'scheduled' && <ScheduledResearchSection onClose={close} />}
                            {activeTab === 'usage' && <UsageSection />}
                            {activeTab === 'about' && <AboutSection />}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/* ════════════════════════════════════════════════════════════════
   Shared primitives — one look for every control in this dialog
   ════════════════════════════════════════════════════════════════ */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="animate-in fade-in duration-300">
            <h2 className="text-lg font-semibold text-[var(--foreground)] pb-4 border-b border-[var(--border-subtle)]">
                {title}
            </h2>
            <div className="divide-y divide-[var(--border-subtle)]">{children}</div>
        </div>
    )
}

/** A single settings row: label + description on the left, control on the right. */
export function Row({
    title,
    description,
    children,
    stacked = false,
}: {
    title: string
    description?: string
    children?: React.ReactNode
    stacked?: boolean
}) {
    return (
        <div className={cn('py-4', stacked ? 'space-y-3' : 'flex items-center justify-between gap-4')}>
            <div className="min-w-0 space-y-0.5">
                <p className="text-sm text-[var(--foreground)]">{title}</p>
                {description && (
                    <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">{description}</p>
                )}
            </div>
            {children && <div className={cn(!stacked && 'shrink-0')}>{children}</div>}
        </div>
    )
}

/** Unified switch — teal when on, quiet gray when off. */
export function SettingSwitch(props: React.ComponentProps<typeof SwitchPrimitive.Root>) {
    return (
        <SwitchPrimitive.Root
            {...props}
            className={cn(
                'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full outline-none transition-colors duration-300',
                'data-[state=checked]:bg-[var(--accent)] data-[state=unchecked]:bg-[var(--muted-foreground)]/25',
                'focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 disabled:cursor-not-allowed disabled:opacity-50',
                props.className
            )}
        >
            <SwitchPrimitive.Thumb
                className="pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-300 translate-x-[2px] data-[state=checked]:translate-x-[18px]"
            />
        </SwitchPrimitive.Root>
    )
}

/** Unified select — quiet, borderless trigger in the ChatGPT spirit. */
export function SettingSelect({
    value,
    onValueChange,
    options,
    placeholder,
}: {
    value?: string
    onValueChange?: (val: string) => void
    options: Array<{ value: string; label: string; disabled?: boolean }>
    placeholder?: string
}) {
    return (
        <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger
                className="h-8 w-auto gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-sm font-normal text-[var(--foreground)] shadow-none hover:bg-[var(--secondary)] data-[state=open]:bg-[var(--secondary)] focus-visible:ring-0 transition-colors"
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent
                align="end"
                className="rounded-xl border-[var(--border-subtle)] bg-[var(--popover)] shadow-lg min-w-[160px] z-[110]"
            >
                {options.map(opt => (
                    <SelectItem
                        key={opt.value}
                        value={opt.value}
                        disabled={opt.disabled}
                        className="rounded-lg text-sm focus:bg-[var(--secondary)] focus:text-[var(--foreground)]"
                    >
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** Unified button — subtle outline by default, red for destructive, teal fill for primary. */
export function SettingButton({
    variant = 'default',
    className,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'danger' | 'primary' }) {
    return (
        <button
            {...props}
            className={cn(
                'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                variant === 'default' && 'border border-[var(--border-subtle)] bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)]',
                variant === 'danger' && 'border border-red-500/25 bg-transparent text-red-500 hover:bg-red-500/10',
                variant === 'primary' && 'border border-transparent bg-[var(--accent)] text-white hover:opacity-90',
                className
            )}
        >
            {children}
        </button>
    )
}

/** Unified confirm dialog for destructive actions. */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
    isPending = false,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
    isPending?: boolean
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-[var(--background)] border border-[var(--border-subtle)] rounded-xl shadow-lg max-w-sm p-6 z-[120]">
                <AlertDialogHeader className="gap-3">
                    <AlertDialogTitle className="text-[var(--foreground)] text-base font-medium flex items-center justify-center mb-1">
                        {title}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[var(--muted-foreground)] text-sm text-center leading-relaxed">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-6 flex flex-row w-full gap-2">
                    <AlertDialogCancel
                        disabled={isPending}
                        className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-transparent text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors h-10 mt-0"
                    >
                        Cancel
                    </AlertDialogCancel>
                    <button
                        onClick={onConfirm}
                        disabled={isPending}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg h-10 text-sm font-medium transition-colors
                            bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 disabled:opacity-50"
                    >
                        {isPending ? <Loader2 size={14} className="animate-spin" /> : confirmLabel}
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/* ════════════════════════════════════════════════════════════════
   General — appearance + account
   ════════════════════════════════════════════════════════════════ */

function GeneralSection() {
    const { theme, setTheme } = useTheme()
    const { isSignedIn } = useAuth()
    const { user } = useUser()
    const clerk = useClerk()
    const [mounted, setMounted] = useState(false)

    useEffect(() => setMounted(true), [])

    const handleSignOut = async () => {
        await clerk.signOut()
        window.location.reload()
    }

    return (
        <Section title="General">
            <Row title="Appearance" description="How the interface looks on this device">
                {mounted && (
                    <SettingSelect
                        value={theme || 'system'}
                        onValueChange={setTheme}
                        options={[
                            { value: 'system', label: 'System' },
                            { value: 'light', label: 'Light' },
                            { value: 'dark', label: 'Dark' },
                        ]}
                    />
                )}
            </Row>

            {isSignedIn && user ? (
                <>
                    <div className="py-4 flex items-center gap-4">
                        {user.imageUrl ? (
                            <img
                                src={user.imageUrl}
                                alt=""
                                className="w-11 h-11 rounded-full ring-1 ring-[var(--border-subtle)] shrink-0 object-cover"
                            />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                                <User size={18} className="text-[var(--accent)]" />
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--foreground)] truncate">
                                {user.fullName || user.firstName || 'User'}
                            </p>
                            <p className="text-[13px] text-[var(--muted-foreground)] truncate mt-0.5">
                                {user.primaryEmailAddress?.emailAddress}
                            </p>
                        </div>
                    </div>

                    <Row
                        title="Manage account"
                        description="Profile, email, security, and connected accounts"
                    >
                        <SettingButton onClick={() => clerk.openUserProfile()}>
                            Manage
                            <ChevronRight size={13} />
                        </SettingButton>
                    </Row>

                    <Row title="Sign out" description="Sign out of your account on this device">
                        <SettingButton variant="danger" onClick={handleSignOut}>
                            <LogOut size={13} />
                            Sign out
                        </SettingButton>
                    </Row>
                </>
            ) : (
                <div className="py-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
                        <User size={20} className="text-[var(--accent)]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-[var(--foreground)]">Sign in for unlimited usage</p>
                        <p className="text-[13px] text-[var(--muted-foreground)]">
                            Unlimited Pro usage and chat history sync across all your devices
                        </p>
                    </div>
                    <SignInButton mode="modal">
                        <SettingButton variant="primary" className="h-9 px-5">Sign in</SettingButton>
                    </SignInButton>
                </div>
            )}
        </Section>
    )
}

/* ════════════════════════════════════════════════════════════════
   Model
   ════════════════════════════════════════════════════════════════ */

function ModelSection() {
    const { isSignedIn } = useAuth()
    const clerk = useClerk()
    const { exceeded } = useUsage()
    const [chatModel, setChatModel] = useState<ModelType>('fast')

    // Locking is guest-only: signed-in users get a generous budget and can
    // check standing in the Usage tab instead of being nagged on every
    // message. Once exhausted, both modes lock the same way — there's no
    // "N left" breakdown shown, just usage available or not.
    const isGuest = !isSignedIn
    const locked = isGuest && exceeded

    useEffect(() => {
        const saved = localStorage.getItem('omni_model_preference')
        if (saved === 'fast' || saved === 'pro') setChatModel(saved)
    }, [])

    const handleModelChange = (newModel: ModelType) => {
        if (locked) {
            clerk.openSignIn()
            return
        }
        setChatModel(newModel)
        localStorage.setItem('omni_model_preference', newModel)
    }

    return (
        <Section title="Model">
            <Row
                title="Default mode"
                description="Choose how Omni thinks in new conversations"
                stacked
            >
                <div className="flex flex-col gap-2.5">
                    <ModelOption
                        title="Fast"
                        description={locked
                            ? 'Usage limit reached — sign in for 10× more usage.'
                            : 'Quick, concise answers for everyday questions.'}
                        icon={<Zap size={16} />}
                        active={chatModel === 'fast'}
                        onClick={() => handleModelChange('fast')}
                        locked={locked}
                    />
                    <ModelOption
                        title="Pro"
                        description={locked
                            ? 'Usage limit reached — sign in for 10× more usage.'
                            : 'Deep agent with interactive charts, long-form reports, and multi-step reasoning.'}
                        icon={<Telescope size={16} />}
                        active={chatModel === 'pro'}
                        onClick={() => handleModelChange('pro')}
                        locked={locked}
                    />
                </div>
            </Row>
        </Section>
    )
}

function ModelOption({
    title,
    description,
    icon,
    active,
    onClick,
    locked = false,
}: {
    title: string
    description: string
    icon: React.ReactNode
    active: boolean
    onClick: () => void
    locked?: boolean
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'group relative w-full flex items-center justify-between gap-3 p-4 rounded-xl border text-left transition-all duration-300',
                active
                    ? 'bg-[var(--card)] border-[var(--accent)] ring-1 ring-[var(--accent)]'
                    : 'bg-transparent border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--secondary)]/30'
            )}
        >
            <div className="flex items-start gap-3 min-w-0">
                <div className={cn('mt-0.5 shrink-0 transition-colors duration-300', active ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]')}>
                    {icon}
                </div>
                <div className="space-y-0.5 min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--foreground)]">
                        {title}
                        {locked && <Lock size={12} className="text-[var(--muted-foreground)]" />}
                    </span>
                    <span className="block text-[13px] text-[var(--muted-foreground)] leading-relaxed">
                        {description}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <div className={cn(
                    'w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all duration-300',
                    active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--muted-foreground)]/40 bg-transparent'
                )}>
                    {active && <Check size={11} strokeWidth={3} />}
                </div>
            </div>
        </button>
    )
}

/* ════════════════════════════════════════════════════════════════
   Personalization
   ════════════════════════════════════════════════════════════════ */

function PersonalizationSection() {
    const { enabled: memoryEnabled, toggle: toggleMemory, content: memoryContent, isLoading: memoryLoading, clear: clearMemory } = useMemory()
    const [isMemoryDialogOpen, setIsMemoryDialogOpen] = useState(false)
    const [responseLanguage, setResponseLanguage] = useState('auto')
    const [locationData, setLocationData] = useState<LocationData | null>(null)
    const [isLocating, setIsLocating] = useState(false)

    useEffect(() => {
        const savedLang = localStorage.getItem('omni_response_language')
        if (savedLang) setResponseLanguage(savedLang)
        getUserLocation(false).then(setLocationData).catch(console.error)
    }, [])

    const handleLanguageChange = (val: string) => {
        setResponseLanguage(val)
        localStorage.setItem('omni_response_language', val)
    }

    const handleRefreshLocation = async (type?: 'ip' | 'gps') => {
        setIsLocating(true)
        try {
            const newData = await getUserLocation(true, type)
            setLocationData(newData)
        } finally {
            setIsLocating(false)
        }
    }

    return (
        <Section title="Personalization">
            <Row
                title="Memory"
                description="Omni remembers details from your conversations to give more personal answers"
            >
                <SettingSwitch checked={memoryEnabled} onCheckedChange={toggleMemory} />
            </Row>

            {memoryEnabled && (
                <Row
                    title="Manage memory"
                    description="View what Omni has learned about you"
                >
                    <SettingButton onClick={() => setIsMemoryDialogOpen(true)}>
                        Manage
                        <ChevronRight size={13} />
                    </SettingButton>
                </Row>
            )}

            <MemoryDialog
                open={isMemoryDialogOpen}
                onOpenChange={setIsMemoryDialogOpen}
                content={memoryContent}
                isLoading={memoryLoading}
                onClear={clearMemory}
            />

            <Row title="Response language" description="The language Omni uses to answer">
                <SettingSelect
                    value={responseLanguage}
                    onValueChange={handleLanguageChange}
                    options={[
                        { value: 'auto', label: 'Auto-detect' },
                        { value: 'en', label: 'English' },
                        { value: 'zh-CN', label: '中文（简体）' },
                        { value: 'zh-TW', label: '中文（繁體）' },
                        { value: 'ja', label: '日本語' },
                        { value: 'ko', label: '한국어' },
                    ]}
                />
            </Row>

            <Row
                title="Location"
                description="Used to make answers more relevant to where you are"
                stacked
            >
                <div className="space-y-2.5">
                    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] min-w-0">
                        <MapPin size={14} className="text-[var(--muted-foreground)] shrink-0" />
                        <span className="text-[13px] text-[var(--foreground)] truncate">
                            {isLocating ? 'Locating…' : (locationData?.value || 'Unknown')}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <SettingButton onClick={() => handleRefreshLocation('gps')} disabled={isLocating} className="flex-1">
                            <Navigation size={13} />
                            Precise
                        </SettingButton>
                        <SettingButton onClick={() => handleRefreshLocation()} disabled={isLocating} className="flex-1">
                            <RefreshCw size={13} className={isLocating ? 'animate-spin' : ''} />
                            Refresh
                        </SettingButton>
                    </div>
                </div>
            </Row>
        </Section>
    )
}

/** Standalone dialog rendering the memory document, with a delete action. */
function MemoryDialog({
    open,
    onOpenChange,
    content,
    isLoading,
    onClear,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    content: string
    isLoading: boolean
    onClear: () => Promise<boolean>
}) {
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        setIsDeleting(true)
        const ok = await onClear()
        setIsDeleting(false)
        setIsDeleteConfirmOpen(false)
        if (ok) toast.success('Memory deleted.')
        else toast.error('Failed to delete memory.')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="bg-black/5 dark:bg-black/40"
                className="p-0 border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col gap-0
                    w-[94vw] max-w-[560px] h-[min(560px,80dvh)] rounded-2xl"
            >
                <DialogTitle className="sr-only">Memory</DialogTitle>

                {/* Header */}
                <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border-subtle)] shrink-0">
                    <span className="text-sm font-medium text-[var(--foreground)]">Memory</span>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="p-1.5 -mr-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
                        </div>
                    ) : content ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-headings:text-[var(--foreground)] prose-headings:font-semibold
                            prose-p:text-[var(--foreground)]/90 prose-li:text-[var(--foreground)]/90
                            prose-strong:text-[var(--foreground)] prose-a:text-[var(--accent)]
                            prose-hr:border-[var(--border-subtle)] prose-blockquote:text-[var(--muted-foreground)]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                            <p className="text-sm text-[var(--foreground)]">No memories yet</p>
                            <p className="text-[13px] text-[var(--muted-foreground)] max-w-xs">
                                Omni learns automatically as you chat.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-5 py-3.5 border-t border-[var(--border-subtle)] shrink-0">
                    <SettingButton
                        variant="danger"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        disabled={isLoading || !content}
                    >
                        <Trash2 size={13} />
                        Delete memory
                    </SettingButton>
                </div>

                <ConfirmDialog
                    open={isDeleteConfirmOpen}
                    onOpenChange={setIsDeleteConfirmOpen}
                    title="Delete memory?"
                    description="This will permanently erase everything Omni has learned about you. This action cannot be undone."
                    confirmLabel="Delete"
                    onConfirm={handleDelete}
                    isPending={isDeleting}
                />
            </DialogContent>
        </Dialog>
    )
}

/* ════════════════════════════════════════════════════════════════
   Data controls
   ════════════════════════════════════════════════════════════════ */

function DataControlsSection() {
    const { fetchWithAuth } = useApi()
    const [isServerConfirmOpen, setIsServerConfirmOpen] = useState(false)
    const [isDeletingServerData, setIsDeletingServerData] = useState(false)

    const handleDeleteAllData = async () => {
        setIsDeletingServerData(true)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/user-data`, { method: 'DELETE' })
            if (!res.ok) throw new Error('backend delete failed')
            // Published pages live in the frontend's own Redis — best-effort, ignore failure
            // (guests never have any, so a 401 here is expected and harmless).
            await fetch('/api/unpublish-all', { method: 'POST' }).catch(() => {})

            const preservedGuestId = localStorage.getItem('guest_id')
            localStorage.clear()
            if (preservedGuestId) {
                localStorage.setItem('guest_id', preservedGuestId)
            }
            toast.success('All your data has been deleted.')
            window.location.reload()
        } catch {
            toast.error('Failed to delete your data. Please try again.')
        } finally {
            setIsDeletingServerData(false)
            setIsServerConfirmOpen(false)
        }
    }

    return (
        <Section title="Data controls">
            <Row
                title="Delete all data"
                description="Permanently erase everything associated with you — chats, memory, uploaded files, and published pages"
            >
                <SettingButton variant="danger" onClick={() => setIsServerConfirmOpen(true)}>
                    Delete all
                </SettingButton>
            </Row>

            <div className="py-4 space-y-2.5 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                <p className="text-sm font-medium text-[var(--foreground)]">How your data is handled</p>
                <p>
                    Chat history is stored on our secure cloud servers so you can pick up any conversation from any
                    device. Everything is encrypted, and we never sell your personal information to third parties.
                </p>
                <p>
                    Signed-in accounts keep chat history for 90 days of inactivity; guest history is kept for 3 days.
                </p>
            </div>

            <ConfirmDialog
                open={isServerConfirmOpen}
                onOpenChange={setIsServerConfirmOpen}
                title="Delete all your data?"
                description="This will permanently erase all data associated with you, including chats, memory, uploaded files, and published pages — on every device. This action cannot be undone."
                confirmLabel="Delete everything"
                onConfirm={handleDeleteAllData}
                isPending={isDeletingServerData}
            />
        </Section>
    )
}

/* ════════════════════════════════════════════════════════════════
   My pages
   ════════════════════════════════════════════════════════════════ */

function PagesSection() {
    const { isSignedIn } = useAuth()
    const clerk = useClerk()
    const [pages, setPages] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isUnpublishingId, setIsUnpublishingId] = useState<string | null>(null)
    const [pageToUnpublish, setPageToUnpublish] = useState<string | null>(null)
    const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
    const [isDeletingAll, setIsDeletingAll] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    const fetchPages = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/my-pages')
            if (!res.ok) throw new Error('Failed to fetch pages')
            const data = await res.json()
            setPages(data.pages || [])
        } catch (error) {
            console.error('Error fetching my pages:', error)
            toast.error('Failed to load your pages')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        // Publishing a page requires a Clerk account (/api/my-pages 401s for
        // guests) — skip the doomed request and just show the sign-in prompt.
        if (!isSignedIn) {
            setIsLoading(false)
            return
        }
        fetchPages()
    }, [isSignedIn, fetchPages])

    const handleUnpublish = async () => {
        const id = pageToUnpublish
        if (!id) return
        setPageToUnpublish(null)
        setIsUnpublishingId(id)
        try {
            const res = await fetch('/api/unpublish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            })
            if (!res.ok) throw new Error('Failed to unpublish')
            setPages(prev => prev.filter(p => p.id !== id))
            toast.success('Sharing stopped')
        } catch (error) {
            console.error('Failed to unpublish:', error)
            toast.error('Failed to stop sharing')
        } finally {
            setIsUnpublishingId(null)
        }
    }

    const copyLink = (id: string) => {
        navigator.clipboard.writeText(`${window.location.origin}/pages/${id}`)
        toast.success('Link copied')
    }

    const handleToggleListing = async (id: string, nextListed: boolean) => {
        setTogglingId(id)
        const prevPages = pages
        setPages(prev => prev.map(p => p.id === id ? { ...p, publishToPages: nextListed ? undefined : false } : p))
        try {
            const res = await fetch('/api/pages/toggle-listing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, listed: nextListed }),
            })
            if (!res.ok) throw new Error('Failed to update listing')
            toast.success(nextListed ? 'Listed on Pages home' : 'Removed from Pages home')
        } catch (error) {
            console.error('Failed to toggle listing:', error)
            setPages(prevPages)
            toast.error('Failed to update this page')
        } finally {
            setTogglingId(null)
        }
    }

    const handleUnpublishAll = async () => {
        setIsDeletingAll(true)
        try {
            const res = await fetch('/api/unpublish-all', { method: 'POST' })
            if (!res.ok) throw new Error('Failed to unpublish all')
            setPages([])
            toast.success('All pages unpublished')
        } catch (error) {
            console.error('Failed to unpublish all:', error)
            toast.error('Failed to unpublish all pages')
        } finally {
            setIsDeletingAll(false)
            setIsDeleteAllConfirmOpen(false)
        }
    }

    if (!isSignedIn) {
        return (
            <Section title="My pages">
                <div className="py-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto">
                        <Lock size={18} className="text-[var(--muted-foreground)]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-[var(--foreground)]">Sign in to manage pages</p>
                        <p className="text-[13px] text-[var(--muted-foreground)]">
                            Publishing and managing shared pages requires an account.
                        </p>
                    </div>
                    <SettingButton variant="primary" onClick={() => clerk.openSignIn()} className="h-9 px-5">
                        Sign in
                    </SettingButton>
                </div>
            </Section>
        )
    }

    return (
        <Section title="My pages">
            <Row
                title="Published pages"
                description="Anyone with the link can always open a published page. Toggle whether it's also listed on the public Pages home."
                stacked
            >
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 rounded-xl border border-[var(--border-subtle)]">
                        <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
                    </div>
                ) : pages.length === 0 ? (
                    <div className="py-8 text-center text-[13px] text-[var(--muted-foreground)] rounded-xl border border-dashed border-[var(--border-subtle)]">
                        You haven&apos;t published any pages yet.
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {pages.map((page) => {
                            const dateStr = page.publishedAt || page.created_at
                            const dateObj = dateStr ? new Date(dateStr) : null
                            const formattedDate = dateObj
                                ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(dateObj)
                                : 'Unknown date'
                            const url = `${window.location.origin}/pages/${page.id}`
                            const isListed = page.publishToPages !== false

                            return (
                                <div
                                    key={page.id}
                                    className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--secondary)]/30 transition-colors group"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--foreground)] truncate">
                                            {page.title || 'Untitled Research'}
                                        </p>
                                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 flex items-center gap-1">
                                            Published {formattedDate}
                                            <span className="opacity-50">·</span>
                                            {isListed ? (
                                                <span className="flex items-center gap-1"><Globe size={11} />Listed</span>
                                            ) : (
                                                <span className="flex items-center gap-1"><Lock size={11} />Unlisted</span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <SettingSwitch
                                            checked={isListed}
                                            disabled={togglingId === page.id}
                                            onCheckedChange={(checked) => handleToggleListing(page.id, checked)}
                                            title={isListed ? 'Listed on Pages home' : 'Unlisted — link only'}
                                        />
                                        <button
                                            onClick={() => window.open(url, '_blank')}
                                            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-lg transition-colors"
                                            title="Open page"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                        <button
                                            onClick={() => copyLink(page.id)}
                                            className="p-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] rounded-lg transition-colors"
                                            title="Copy link"
                                        >
                                            <Copy size={14} />
                                        </button>
                                        <button
                                            onClick={() => setPageToUnpublish(page.id)}
                                            disabled={isUnpublishingId === page.id}
                                            className="p-2 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                            title="Stop sharing"
                                        >
                                            {isUnpublishingId === page.id ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={14} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Row>

            {pages.length > 0 && (
                <Row title="Unpublish all pages" description="Stop sharing every page at once">
                    <SettingButton variant="danger" onClick={() => setIsDeleteAllConfirmOpen(true)}>
                        Unpublish all
                    </SettingButton>
                </Row>
            )}

            <ConfirmDialog
                open={!!pageToUnpublish}
                onOpenChange={(open) => !open && setPageToUnpublish(null)}
                title="Stop sharing this page?"
                description="The public link will no longer work. This action cannot be undone."
                confirmLabel="Stop sharing"
                onConfirm={handleUnpublish}
            />

            <ConfirmDialog
                open={isDeleteAllConfirmOpen}
                onOpenChange={setIsDeleteAllConfirmOpen}
                title="Unpublish all pages?"
                description={`This will unpublish all ${pages.length} of your shared pages. Their public links will stop working. This action cannot be undone.`}
                confirmLabel="Unpublish all"
                onConfirm={handleUnpublishAll}
                isPending={isDeletingAll}
            />
        </Section>
    )
}

/* ════════════════════════════════════════════════════════════════
   Chat history — search, open, and delete threads
   ════════════════════════════════════════════════════════════════ */

interface ThreadItem {
    thread_id: string
    title: string
    timestamp: number
}

function ChatHistorySection({ onClose }: { onClose: () => void }) {
    const router = useRouter()
    const { fetchWithAuth } = useApi()

    const [threads, setThreads] = useState<ThreadItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [searchResults, setSearchResults] = useState<ThreadItem[] | null>(null)
    const [isSearching, setIsSearching] = useState(false)
    const searchRequestIdRef = useRef(0)
    const [threadToDelete, setThreadToDelete] = useState<string | null>(null)
    const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Guests are backend-persisted too (fetchWithAuth sends X-Guest-Id, which
    // the backend resolves into a real user_id) — no local-only fallback needed.
    const loadThreads = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/api/threads`)
            if (res.ok) {
                const data = await res.json()
                const items: ThreadItem[] = (data.threads || [])
                    .filter((t: any) => t.title && t.title.trim() !== '')
                    .map((t: any) => ({
                        thread_id: t.thread_id,
                        title: t.title,
                        timestamp: new Date(t.updated_at).getTime(),
                    }))
                items.sort((a, b) => b.timestamp - a.timestamp)
                setThreads(items)
            }
        } catch {
            toast.error('Failed to load chat history')
        } finally {
            setIsLoading(false)
        }
    }, [fetchWithAuth])

    useEffect(() => {
        loadThreads()
    }, [loadThreads])

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 200)
        return () => clearTimeout(handler)
    }, [searchQuery])

    // Backend full-text search for everyone
    useEffect(() => {
        if (!debouncedQuery) {
            setSearchResults(null)
            setIsSearching(false)
            return
        }
        const requestId = ++searchRequestIdRef.current
        setIsSearching(true)
        fetchWithAuth(`${BACKEND_URL}/api/threads/search?q=${encodeURIComponent(debouncedQuery)}&limit=50`)
            .then(async (res) => {
                if (requestId !== searchRequestIdRef.current) return
                if (!res.ok) { setSearchResults([]); return }
                const data = await res.json()
                const results: ThreadItem[] = Array.isArray(data.results)
                    ? data.results.map((r: any) => ({
                        thread_id: r.thread_id,
                        title: r.title || 'Untitled Chat',
                        timestamp: new Date(r.updated_at).getTime(),
                    }))
                    : []
                setSearchResults(results)
            })
            .catch(() => {
                if (requestId === searchRequestIdRef.current) setSearchResults([])
            })
            .finally(() => {
                if (requestId === searchRequestIdRef.current) setIsSearching(false)
            })
    }, [debouncedQuery, fetchWithAuth])

    const removeThreadLocalCache = useCallback((threadId: string) => {
        const keys = Object.keys(localStorage)
        for (const key of keys) {
            const value = localStorage.getItem(key)
            if (!value) continue
            let shouldRemove = key === threadId || key.endsWith(`_chat_${threadId}`)
            if (!shouldRemove) {
                try {
                    const data = JSON.parse(value)
                    shouldRemove = data?.thread_id === threadId
                } catch { }
            }
            if (shouldRemove) localStorage.removeItem(key)
        }
    }, [])

    const handleOpenThread = (threadId: string) => {
        onClose()
        router.push(`/thread/${threadId}`)
    }

    const handleDeleteThread = async () => {
        const id = threadToDelete
        if (!id) return
        setIsDeleting(true)
        try {
            removeThreadLocalCache(id)
            const res = await fetchWithAuth(`${BACKEND_URL}/api/threads/${id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('delete failed')
            setThreads(prev => prev.filter(t => t.thread_id !== id))
            setSearchResults(prev => prev ? prev.filter(t => t.thread_id !== id) : prev)
        } catch {
            toast.error('Failed to delete thread')
            loadThreads()
        } finally {
            setThreadToDelete(null)
            setIsDeleting(false)
        }
    }

    const handleDeleteAll = async () => {
        setIsDeleting(true)
        try {
            if (threads.length > 0) {
                const threadIds = threads.map(t => t.thread_id)
                const BATCH_SIZE = 100
                for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
                    const batch = threadIds.slice(i, i + BATCH_SIZE)
                    await fetchWithAuth(`${BACKEND_URL}/api/threads/batch-delete`, {
                        method: 'POST',
                        body: JSON.stringify({ thread_ids: batch }),
                    })
                }
            }
            // Clear all thread-shaped entries from localStorage
            const keys = Object.keys(localStorage)
            for (const key of keys) {
                try {
                    const raw = localStorage.getItem(key)
                    if (raw) {
                        const data = JSON.parse(raw)
                        if (data?.thread_id || key.includes('_chat_')) {
                            localStorage.removeItem(key)
                        }
                    }
                } catch {
                    if (key.includes('_chat_')) localStorage.removeItem(key)
                }
            }
            setThreads([])
            setSearchResults(null)
            setSearchQuery('')
            toast.success('All threads deleted')
        } catch {
            toast.error('Failed to delete all threads')
            loadThreads()
        } finally {
            setIsDeleting(false)
            setIsDeleteAllOpen(false)
        }
    }

    const displayedThreads = debouncedQuery ? (searchResults ?? []) : threads
    const isSearchPending = !!searchQuery.trim() && (debouncedQuery !== searchQuery.trim() || isSearching)

    return (
        <Section title="Chat history">
            <div className="py-4 space-y-3">
                {/* Search */}
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] focus-within:border-[var(--muted-foreground)]/40 transition-colors">
                    <Search size={14} className="text-[var(--muted-foreground)] shrink-0" />
                    <input
                        type="text"
                        placeholder="Search chats…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Thread list */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-10 rounded-xl border border-[var(--border-subtle)]">
                        <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
                    </div>
                ) : displayedThreads.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-[var(--muted-foreground)] rounded-xl border border-dashed border-[var(--border-subtle)]">
                        {isSearchPending ? 'Searching…' : debouncedQuery ? 'No results found' : 'No chat history yet'}
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[340px] overflow-y-auto custom-scrollbar -mx-1 px-1">
                        {displayedThreads.map(thread => (
                            <div
                                key={thread.thread_id}
                                onClick={() => handleOpenThread(thread.thread_id)}
                                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--secondary)]/60 transition-colors cursor-pointer"
                            >
                                <MessageSquare size={15} className="text-[var(--muted-foreground)] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-[var(--foreground)] truncate">{thread.title}</p>
                                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                                        {formatDistanceToNow(thread.timestamp, { addSuffix: true })}
                                    </p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenThread(thread.thread_id) }}
                                        className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--card)] rounded-lg transition-colors"
                                        title="Open"
                                    >
                                        <ExternalLink size={13} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setThreadToDelete(thread.thread_id) }}
                                        className="p-1.5 text-[var(--muted-foreground)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {threads.length > 0 && (
                <Row title="Delete all threads" description="Permanently remove your entire chat history">
                    <SettingButton variant="danger" onClick={() => setIsDeleteAllOpen(true)}>
                        Delete all
                    </SettingButton>
                </Row>
            )}

            <ConfirmDialog
                open={!!threadToDelete}
                onOpenChange={(open) => !open && setThreadToDelete(null)}
                title="Delete thread?"
                description="This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={handleDeleteThread}
                isPending={isDeleting}
            />

            <ConfirmDialog
                open={isDeleteAllOpen}
                onOpenChange={setIsDeleteAllOpen}
                title="Clear all history?"
                description={`This will permanently delete all ${threads.length} threads. This action cannot be undone.`}
                confirmLabel="Delete all"
                onConfirm={handleDeleteAll}
                isPending={isDeleting}
            />
        </Section>
    )
}

/* ════════════════════════════════════════════════════════════════
   Usage
   ════════════════════════════════════════════════════════════════ */

function UsageSection() {
    const { isSignedIn } = useAuth()
    const clerk = useClerk()
    const { usage, isLoading, lastRefreshedAt, refresh } = useUsage()
    // Forces a re-render every so often so "Last updated Xm ago" stays accurate
    // without needing a network call.
    const [, forceTick] = useState(0)

    useEffect(() => {
        const interval = setInterval(() => forceTick(t => t + 1), 30_000)
        return () => clearInterval(interval)
    }, [])

    if (isLoading && !usage) {
        return (
            <Section title="Usage">
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
                </div>
            </Section>
        )
    }

    if (!usage) return null

    const resetMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' })
        .format(new Date(usage.resets_month_at))

    return (
        <Section title="Usage">
            <div className="py-4 flex items-center justify-between gap-4">
                <p className="text-[13px] text-[var(--muted-foreground)]">
                    {lastRefreshedAt
                        ? `Last updated ${formatDistanceToNow(lastRefreshedAt, { addSuffix: true })}`
                        : 'Not yet loaded'}
                </p>
                <SettingButton onClick={refresh} disabled={isLoading}>
                    <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                    Refresh
                </SettingButton>
            </div>

            {!isSignedIn && (
                <div className="py-4">
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--secondary)]/40">
                        <div className="space-y-0.5">
                            <p className="text-sm font-medium text-[var(--foreground)]">Get 10× more usage</p>
                            <p className="text-[13px] text-[var(--muted-foreground)]">Sign in for free — no card required.</p>
                        </div>
                        <SettingButton variant="primary" onClick={() => clerk.openSignIn()} className="h-9 px-4 shrink-0">
                            Sign in
                        </SettingButton>
                    </div>
                </div>
            )}

            <UsageMeter
                label="Today"
                used={usage.day_used}
                limit={usage.day_limit}
                resetLabel={formatResetsIn(usage.resets_day_at)}
            />
            <UsageMeter
                label="This month"
                used={usage.month_used}
                limit={usage.month_limit}
                resetLabel={`Renews on ${resetMonthLabel}`}
            />
        </Section>
    )
}

/** "Resets in 5 hours 32 min" — recomputed on every render, refreshed by
 * UsageSection's 30s tick, so it counts down live instead of showing a
 * fixed clock time the user has to do math against. */
function formatResetsIn(resetsAt: string): string {
    const ms = new Date(resetsAt).getTime() - Date.now()
    if (ms <= 0) return 'Resets shortly'
    const totalMinutes = Math.ceil(ms / 60_000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours <= 0) return `Resets in ${minutes} min`
    return `Resets in ${hours} hours ${minutes} min`
}

function UsageMeter({
    label,
    used,
    limit,
    resetLabel,
}: {
    label: string
    used: number
    limit: number
    resetLabel: string
}) {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
    return (
        <Row title={label} stacked>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--foreground)] font-medium">{pct}% used</span>
                    <span className="text-[var(--muted-foreground)]">{resetLabel}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--secondary)] overflow-hidden">
                    <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </Row>
    )
}

/* ════════════════════════════════════════════════════════════════
   About
   ════════════════════════════════════════════════════════════════ */

function AboutSection() {
    return (
        <Section title="About">
            <div className="py-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--secondary)] flex items-center justify-center overflow-hidden shrink-0">
                    <Image
                        src="/android-chrome-512x512.png"
                        alt="Omni Knows logo"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                        unoptimized
                    />
                </div>
                <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{APP_NAME}</p>
                    <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                        v{APP_VERSION} · Alpha build
                    </p>
                </div>
            </div>

            <div className="py-4">
                <p className="text-[13px] leading-relaxed text-[var(--muted-foreground)]">
                    Omni Knows is an AI research assistant built to help you explore complex topics deeply and
                    efficiently — powered by a next-generation agentic framework, a healthy respect for good
                    sources, and an unreasonable amount of tea.
                </p>
            </div>

            <Row title="Website">
                <AboutLink href="https://omniknows.xyz" label="omniknows.xyz" />
            </Row>
            <Row title="The story behind Omni">
                <AboutLink href="https://haozhe.li/blog/omniknows-neo" label="Read the blog" />
            </Row>
            <Row title="How it works under the hood">
                <AboutLink href="https://haozhe.li/blog/omniknows-neo-tech" label="Tech deep-dive" />
            </Row>

            <div className="py-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span>© {new Date().getFullYear()} {APP_NAME}</span>
                <span className="opacity-60">Designed by Haozhe Li</span>
            </div>
        </Section>
    )
}

function AboutLink({ href, label }: { href: string; label: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-medium
                text-[var(--muted-foreground)] border border-[var(--border-subtle)]
                hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
        >
            {label}
            <ExternalLink size={12} />
        </a>
    )
}

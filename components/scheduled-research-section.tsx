'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser, useAuth, useClerk } from '@clerk/nextjs'
import {
    Plus,
    Clock,
    Mail,
    Trash2,
    Pencil,
    ChevronLeft,
    ChevronRight,
    FileText,
    Loader2,
    ArrowRight,
    Lock,
    X,
    AlertCircle,
    CheckCircle2,
    MailCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { useApi } from '@/hooks/useApi'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Section, Row, SettingButton, SettingSelect, ConfirmDialog } from '@/components/settings-dialog'
import { buildCron, parseCron, formatScheduleLabel, formatScheduleLabelFromCron, type ScheduleConfig, type ScheduleFrequency } from '@/lib/cron'
import { cn } from '@/lib/utils'

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const MAX_TASKS = 3

interface ScheduledTaskRun {
    run_id: string
    thread_id: string | null
    summary: string | null
    status: 'pending' | 'running' | 'success' | 'failed'
    error: string | null
    created_at: string
}

interface ScheduledTask {
    task_id: string
    name: string
    prompt: string
    cron_schedule: string
    email: string
    status: 'active' | 'paused' | 'deleted'
    created_at: string
    runs?: ScheduledTaskRun[]
}

interface Preset {
    name: string
    prompt: string
    frequency: ScheduleFrequency
}

const PRESETS: Preset[] = [
    { name: 'News Digest', prompt: 'Give me a morning roundup of the most impactful news stories from around the world.', frequency: 'daily' },
    { name: 'Market Forecast', prompt: 'Research a portfolio of stocks to watch this week based on recent performance and upcoming events.', frequency: 'weekly' },
    { name: 'Tech Insights', prompt: 'Analyze emerging technologies, AI developments, and their business implications from the past week.', frequency: 'weekly' },
    { name: 'Science Explorer', prompt: "Give me a digest of this month's scientific breakthroughs, research papers, and space exploration news.", frequency: 'monthly' },
    { name: 'Sports Roundup', prompt: 'Summarize major sports events, scores, and breaking news from today.', frequency: 'daily' },
    { name: 'Entertainment Weekly', prompt: 'Roundup new streaming releases, trending shows, and entertainment news from this week.', frequency: 'weekly' },
]

interface FormState {
    task_id?: string
    name: string
    prompt: string
    config: ScheduleConfig
}

export function ScheduledResearchSection({ onClose }: { onClose: () => void }) {
    const { isSignedIn } = useAuth()
    const { user } = useUser()
    const clerk = useClerk()
    const { fetchWithAuth } = useApi()

    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [detailTaskId, setDetailTaskId] = useState<string | null>(null)

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [formInitial, setFormInitial] = useState<FormState | null>(null)

    const [taskToDelete, setTaskToDelete] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [quickPrompt, setQuickPrompt] = useState('')
    const [isParsing, setIsParsing] = useState(false)

    const email = user?.primaryEmailAddress?.emailAddress || ''

    const loadTasks = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/schedule_task`)
            if (res.ok) {
                const data = await res.json()
                setTasks(data.tasks || [])
            }
        } catch {
            toast.error('Failed to load scheduled tasks')
        } finally {
            setIsLoading(false)
        }
    }, [fetchWithAuth])

    useEffect(() => {
        if (isSignedIn) loadTasks()
        else setIsLoading(false)
    }, [isSignedIn, loadTasks])

    const activeTasks = tasks.filter(t => t.status !== 'deleted')
    const atLimit = activeTasks.length >= MAX_TASKS

    const openCreate = (prefill?: {
        name?: string
        prompt: string
        frequency?: ScheduleFrequency
        time?: string
        weekday?: number
        dayOfMonth?: number
    }) => {
        if (atLimit) {
            toast.error(`You can have at most ${MAX_TASKS} scheduled tasks at a time.`)
            return
        }
        setFormMode('create')
        setFormInitial({
            name: prefill?.name || '',
            prompt: prefill?.prompt || '',
            config: {
                frequency: prefill?.frequency || 'daily',
                time: prefill?.time || '09:00',
                weekday: prefill?.weekday ?? 1,
                dayOfMonth: prefill?.dayOfMonth ?? 1,
            },
        })
        setFormOpen(true)
    }

    const openEdit = (task: ScheduledTask) => {
        const config = parseCron(task.cron_schedule) || { frequency: 'daily' as ScheduleFrequency, time: '09:00' }
        setFormMode('edit')
        setFormInitial({ task_id: task.task_id, name: task.name, prompt: task.prompt, config })
        setFormOpen(true)
    }

    const handleQuickSubmit = async () => {
        const text = quickPrompt.trim()
        if (!text || isParsing) return
        setIsParsing(true)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/schedule_task/parse`, {
                method: 'POST',
                body: JSON.stringify({ text }),
            })
            if (!res.ok) throw new Error('parse failed')
            const parsed = await res.json()
            const st = parsed.schedule_time || {}
            openCreate({
                name: parsed.title,
                prompt: parsed.instruction || text,
                frequency: st.frequency,
                time: st.time,
                weekday: st.weekday ?? undefined,
                dayOfMonth: st.day_of_month ?? undefined,
            })
            setQuickPrompt('')
        } catch {
            toast.error('Failed to understand that request — try "New schedule" instead.')
        } finally {
            setIsParsing(false)
        }
    }

    const handleSaved = async () => {
        setFormOpen(false)
        setQuickPrompt('')
        await loadTasks()
    }

    const handleDelete = async () => {
        const id = taskToDelete
        if (!id) return
        setIsDeleting(true)
        try {
            const res = await fetchWithAuth(`${BACKEND_URL}/schedule_task/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ action: 'delete' }),
            })
            if (!res.ok) throw new Error('delete failed')
            setTasks(prev => prev.filter(t => t.task_id !== id))
            if (detailTaskId === id) setDetailTaskId(null)
            toast.success('Scheduled task deleted')
        } catch {
            toast.error('Failed to delete task')
        } finally {
            setIsDeleting(false)
            setTaskToDelete(null)
        }
    }

    if (!isSignedIn) {
        return (
            <Section title="Scheduled Research">
                <div className="py-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto">
                        <Lock size={18} className="text-[var(--muted-foreground)]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-[var(--foreground)]">Sign in for scheduled research</p>
                        <p className="text-[13px] text-[var(--muted-foreground)]">
                            Reports are emailed to your account, so signing in is required.
                        </p>
                    </div>
                    <SettingButton variant="primary" onClick={() => clerk.openSignIn()} className="h-9 px-5">
                        Sign in
                    </SettingButton>
                </div>
            </Section>
        )
    }

    const detailTask = detailTaskId ? tasks.find(t => t.task_id === detailTaskId) : null

    return (
        <>
        {detailTask ? (
            <TaskDetail
                task={detailTask}
                onBack={() => setDetailTaskId(null)}
                onEdit={() => openEdit(detailTask)}
                onDelete={() => setTaskToDelete(detailTask.task_id)}
                onClose={onClose}
            />
        ) : (
        <Section title="Scheduled Research">
            {/* ── Section 1: create ── */}
            <div className="py-4 space-y-4">
                <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">Create a scheduled research</p>
                    <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                        Schedule recurring research to get reports on topics you care about.
                    </p>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] focus-within:border-[var(--muted-foreground)]/40 transition-colors p-4 space-y-3">
                    <textarea
                        value={quickPrompt}
                        onChange={e => setQuickPrompt(e.target.value)}
                        placeholder="Send me a daily summary of AI news every morning"
                        rows={2}
                        disabled={isParsing}
                        className="w-full resize-none bg-transparent outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] disabled:opacity-60"
                    />
                    <div className="flex items-center justify-end">
                        <button
                            onClick={handleQuickSubmit}
                            disabled={!quickPrompt.trim() || atLimit || isParsing}
                            className="h-8 w-8 flex items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shrink-0"
                            title="Create scheduled research"
                        >
                            {isParsing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={15} />}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {PRESETS.map(preset => (
                        <button
                            key={preset.name}
                            onClick={() => openCreate(preset)}
                            disabled={atLimit}
                            className="text-left p-3.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--secondary)]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <p className="text-sm font-medium text-[var(--foreground)]">{preset.name}</p>
                            <p className="text-[12px] text-[var(--muted-foreground)] mt-1 leading-relaxed line-clamp-2">
                                {preset.prompt}
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Section 2: list ── */}
            <div className="py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-[var(--foreground)]">Scheduled Research</p>
                        <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                            {activeTasks.length} of {MAX_TASKS} used
                        </p>
                    </div>
                    <SettingButton onClick={() => openCreate()} disabled={atLimit}>
                        <Plus size={13} />
                        New schedule
                    </SettingButton>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-10 rounded-xl border border-[var(--border-subtle)]">
                        <Loader2 size={16} className="animate-spin text-[var(--muted-foreground)]" />
                    </div>
                ) : activeTasks.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-[var(--muted-foreground)] rounded-xl border border-dashed border-[var(--border-subtle)]">
                        No scheduled research yet
                    </div>
                ) : (
                    <div className="space-y-1">
                        {activeTasks.map(task => (
                            <div
                                key={task.task_id}
                                onClick={() => setDetailTaskId(task.task_id)}
                                className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--secondary)]/60 transition-colors cursor-pointer"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-[var(--foreground)] truncate">{task.name || 'Untitled schedule'}</p>
                                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 flex items-center gap-1">
                                        <Clock size={11} className="shrink-0" />
                                        {formatScheduleLabelFromCron(task.cron_schedule)}
                                        {task.status === 'paused' && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--secondary)]">Paused</span>}
                                    </p>
                                </div>
                                <ChevronRight size={14} className="text-[var(--muted-foreground)]/50 shrink-0" />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Section>
        )}

            {formOpen && formInitial && (
                <TaskFormDialog
                    mode={formMode}
                    initial={formInitial}
                    email={email}
                    onClose={() => setFormOpen(false)}
                    onSaved={handleSaved}
                    fetchWithAuth={fetchWithAuth}
                />
            )}

            <ConfirmDialog
                open={!!taskToDelete}
                onOpenChange={(open) => !open && setTaskToDelete(null)}
                title="Delete scheduled research?"
                description="Future runs will stop and this schedule will be removed. Reports already generated stay accessible on their Pages links. This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={handleDelete}
                isPending={isDeleting}
            />
        </>
    )
}

/* ════════════════════════════════════════════════════════════════
   Task detail — borrows Chat history's list styling for the run history
   ════════════════════════════════════════════════════════════════ */

function TaskDetail({
    task,
    onBack,
    onEdit,
    onDelete,
    onClose,
}: {
    task: ScheduledTask
    onBack: () => void
    onEdit: () => void
    onDelete: () => void
    onClose: () => void
}) {
    const router = useRouter()
    const runs = task.runs || []

    const handleOpenRun = (run: ScheduledTaskRun) => {
        if (run.status !== 'success') return
        onClose()
        router.push(`/schedule/${run.run_id}`)
    }

    return (
        <div className="animate-in fade-in duration-300">
            <div className="flex items-center gap-2 pb-4 border-b border-[var(--border-subtle)]">
                <button
                    onClick={onBack}
                    className="p-1.5 -ml-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                >
                    <ChevronLeft size={17} />
                </button>
                <h2 className="text-lg font-semibold text-[var(--foreground)] truncate flex-1">
                    {task.name || 'Untitled schedule'}
                </h2>
            </div>

            <div className="py-4 space-y-1.5 border-b border-[var(--border-subtle)]">
                <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">{task.prompt}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted-foreground)] pt-1">
                    <span className="flex items-center gap-1"><Clock size={11} />{formatScheduleLabelFromCron(task.cron_schedule)}</span>
                    <span className="flex items-center gap-1"><Mail size={11} />{task.email}</span>
                </div>
                <div className="flex items-center gap-2 pt-2">
                    <SettingButton onClick={onEdit}>
                        <Pencil size={13} />
                        Edit
                    </SettingButton>
                    <SettingButton variant="danger" onClick={onDelete}>
                        <Trash2 size={13} />
                        Delete
                    </SettingButton>
                </div>
            </div>

            <div className="py-4 space-y-1">
                <p className="text-sm font-medium text-[var(--foreground)] pb-2">Reports</p>
                {runs.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-[var(--muted-foreground)] rounded-xl border border-dashed border-[var(--border-subtle)]">
                        No reports generated yet
                    </div>
                ) : (
                    <div className="space-y-1 max-h-[340px] overflow-y-auto custom-scrollbar -mx-1 px-1">
                        {runs.map(run => (
                            <div
                                key={run.run_id}
                                onClick={() => handleOpenRun(run)}
                                className={cn(
                                    'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                                    run.status === 'success' ? 'hover:bg-[var(--secondary)]/60 cursor-pointer' : 'cursor-default'
                                )}
                            >
                                {run.status === 'pending' || run.status === 'running' ? (
                                    <Loader2 size={15} className="text-[var(--muted-foreground)] shrink-0 animate-spin" />
                                ) : run.status === 'failed' ? (
                                    <AlertCircle size={15} className="text-red-500 shrink-0" />
                                ) : (
                                    <FileText size={15} className="text-[var(--muted-foreground)] shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-[var(--foreground)] truncate">
                                        {run.status === 'success'
                                            ? (run.summary ? run.summary.slice(0, 80) : 'Report ready')
                                            : run.status === 'failed'
                                                ? 'Generation failed'
                                                : 'Generating…'}
                                    </p>
                                    <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

/* ════════════════════════════════════════════════════════════════
   Create / edit modal
   ════════════════════════════════════════════════════════════════ */

const WEEKDAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .map((label, value) => ({ value: String(value), label }))

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }))

function TaskFormDialog({
    mode,
    initial,
    email,
    onClose,
    onSaved,
    fetchWithAuth,
}: {
    mode: 'create' | 'edit'
    initial: FormState
    email: string
    onClose: () => void
    onSaved: () => void
    fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>
}) {
    const [name, setName] = useState(initial.name)
    const [prompt, setPrompt] = useState(initial.prompt)
    const [frequency, setFrequency] = useState<ScheduleFrequency>(initial.config.frequency)
    const [time, setTime] = useState(initial.config.time)
    const [weekday, setWeekday] = useState(initial.config.weekday ?? 1)
    const [dayOfMonth, setDayOfMonth] = useState(initial.config.dayOfMonth ?? 1)
    const [isSaving, setIsSaving] = useState(false)
    // Set only right after a successful *create* — swaps the form for a
    // confirmation screen instead of closing immediately, since a real email
    // just went out and the user should be told to go check for it.
    const [justCreated, setJustCreated] = useState<{ name: string; scheduleLabel: string } | null>(null)

    const canSave = name.trim().length > 0 && prompt.trim().length > 0 && !isSaving

    const handleSave = async () => {
        if (!canSave) return
        setIsSaving(true)
        try {
            const config: ScheduleConfig = { frequency, time, weekday, dayOfMonth }
            const cron_schedule = buildCron(config)
            const scheduleLabel = formatScheduleLabel(config)
            const body = { name: name.trim(), prompt: prompt.trim(), cron_schedule }

            const res = mode === 'create'
                ? await fetchWithAuth(`${BACKEND_URL}/schedule_task`, {
                    method: 'POST',
                    body: JSON.stringify({ ...body, email, schedule_label: scheduleLabel }),
                })
                : await fetchWithAuth(`${BACKEND_URL}/schedule_task/${initial.task_id}`, {
                    method: 'PUT',
                    body: JSON.stringify(body),
                })

            if (!res.ok) {
                const err = await res.json().catch(() => null)
                throw new Error(err?.detail || 'Failed to save')
            }

            if (mode === 'create') {
                setJustCreated({ name: name.trim(), scheduleLabel })
            } else {
                toast.success('Scheduled research updated')
                onSaved()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save scheduled research')
        } finally {
            setIsSaving(false)
        }
    }

    if (justCreated) {
        return (
            <TaskCreatedConfirmation
                name={justCreated.name}
                scheduleLabel={justCreated.scheduleLabel}
                email={email}
                onDone={onSaved}
            />
        )
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="bg-black/5 dark:bg-black/40"
                className="p-0 border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col gap-0
                    w-[94vw] max-w-[520px] max-h-[85dvh] rounded-2xl z-[110]"
            >
                <DialogTitle className="sr-only">Scheduled Research</DialogTitle>

                <div className="flex items-center justify-between px-5 h-14 border-b border-[var(--border-subtle)] shrink-0">
                    <span className="text-sm font-medium text-[var(--foreground)]">Scheduled Research</span>
                    <button
                        onClick={onClose}
                        className="p-1.5 -mr-1.5 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-[var(--foreground)]">Instructions</label>
                        <textarea
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            rows={3}
                            placeholder="Send me a daily summary of AI news every morning"
                            className="w-full resize-none rounded-xl border border-[var(--border-subtle)] focus:border-[var(--muted-foreground)]/40 outline-none transition-colors bg-transparent px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-[var(--foreground)]">Name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Morning AI Digest"
                            className="w-full rounded-xl border border-[var(--border-subtle)] focus:border-[var(--muted-foreground)]/40 outline-none transition-colors bg-transparent px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-[var(--foreground)]">Schedule</label>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="rounded-xl border border-[var(--border-subtle)]">
                                <SettingSelect
                                    value={frequency}
                                    onValueChange={(v) => setFrequency(v as ScheduleFrequency)}
                                    options={[
                                        { value: 'daily', label: 'Daily' },
                                        { value: 'weekly', label: 'Weekly' },
                                        { value: 'monthly', label: 'Monthly' },
                                    ]}
                                />
                            </div>
                            {frequency === 'weekly' && (
                                <div className="rounded-xl border border-[var(--border-subtle)]">
                                    <SettingSelect
                                        value={String(weekday)}
                                        onValueChange={(v) => setWeekday(Number(v))}
                                        options={WEEKDAY_OPTIONS}
                                    />
                                </div>
                            )}
                            {frequency === 'monthly' && (
                                <div className="rounded-xl border border-[var(--border-subtle)]">
                                    <SettingSelect
                                        value={String(dayOfMonth)}
                                        onValueChange={(v) => setDayOfMonth(Number(v))}
                                        options={DAY_OF_MONTH_OPTIONS}
                                    />
                                </div>
                            )}
                            <input
                                type="time"
                                value={time}
                                onChange={e => setTime(e.target.value)}
                                className="rounded-xl border border-[var(--border-subtle)] bg-transparent px-3 py-1.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--muted-foreground)]/40 transition-colors"
                            />
                        </div>
                        <p className="text-[12px] text-[var(--muted-foreground)]">
                            {formatScheduleLabel({ frequency, time, weekday, dayOfMonth })} · your local time
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-[var(--foreground)]">Delivery</label>
                        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--secondary)]/30">
                            <Mail size={14} className="text-[var(--muted-foreground)] shrink-0" />
                            <span className="text-sm text-[var(--foreground)] truncate">{email || 'No email on file'}</span>
                        </div>
                        <p className="text-[12px] text-[var(--muted-foreground)]">
                            Reports are sent to your account email. Custom delivery addresses aren&apos;t supported yet.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[var(--border-subtle)] shrink-0">
                    <SettingButton onClick={onClose}>Cancel</SettingButton>
                    <SettingButton variant="primary" onClick={handleSave} disabled={!canSave}>
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
                    </SettingButton>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/* ════════════════════════════════════════════════════════════════
   Post-create confirmation — shown once, right after a task is saved,
   in place of the form. A real confirmation email just went out
   server-side, so this tells the user to go check for it.
   ════════════════════════════════════════════════════════════════ */

function TaskCreatedConfirmation({
    name,
    scheduleLabel,
    email,
    onDone,
}: {
    name: string
    scheduleLabel: string
    email: string
    onDone: () => void
}) {
    return (
        <Dialog open onOpenChange={(open) => !open && onDone()}>
            <DialogContent
                showCloseButton={false}
                overlayClassName="bg-black/5 dark:bg-black/40"
                className="p-0 border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl overflow-hidden flex flex-col gap-0
                    w-[94vw] max-w-[440px] rounded-2xl z-[110]"
            >
                <DialogTitle className="sr-only">Scheduled research created</DialogTitle>

                <div className="px-6 pt-8 pb-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto">
                        <CheckCircle2 size={22} className="text-[var(--accent)]" />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-base font-medium text-[var(--foreground)]">Scheduled research created</p>
                        <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">
                            <span className="text-[var(--foreground)] font-medium">&ldquo;{name}&rdquo;</span> will run {scheduleLabel.charAt(0).toLowerCase() + scheduleLabel.slice(1)}.
                        </p>
                    </div>

                    <div className="flex items-start gap-2.5 text-left p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--secondary)]/30">
                        <MailCheck size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
                        <p className="text-[13px] text-[var(--foreground)] leading-relaxed">
                            We&apos;ve sent a confirmation email to <span className="font-medium">{email}</span>. Please check your inbox
                            — and your junk/spam folder, just in case — to make sure it arrived.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-center px-5 pb-6">
                    <SettingButton variant="primary" onClick={onDone} className="w-full h-9">
                        Done
                    </SettingButton>
                </div>
            </DialogContent>
        </Dialog>
    )
}

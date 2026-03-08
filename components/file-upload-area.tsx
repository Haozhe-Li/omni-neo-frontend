import { X, File as FileIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { AttachedFile } from '@/hooks/useFileUpload'

export interface FileUploadAreaProps {
    files: AttachedFile[]
    onRemove: (id: string) => void
    className?: string
}

export function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B'
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    else return (bytes / 1048576).toFixed(1) + ' MB'
}

export function FileUploadArea({ files, onRemove, className = '' }: FileUploadAreaProps) {
    if (!files || files.length === 0) return null

    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {files.map((file) => (
                <div
                    key={file.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${file.status === 'error'
                        ? 'border-destructive/50 bg-destructive/10 text-destructive'
                        : file.status === 'ready'
                            ? 'border-[var(--border-subtle)] bg-[var(--secondary)]/50 text-[var(--foreground)]'
                            : 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--foreground)]'
                        }`}
                >
                    <div className="shrink-0 flex items-center justify-center relative w-8 h-8 rounded bg-[var(--background)] border border-[var(--border-subtle)]">
                        {file.status === 'uploading' ? (
                            <div className="absolute inset-0 flex flex-col justify-end overflow-hidden pb-1 opacity-20">
                                <div
                                    className="bg-[var(--accent)] w-full transition-all duration-300"
                                    style={{ height: `${file.progress}%` }}
                                />
                            </div>
                        ) : null}
                        <FileIcon size={16} className="text-[var(--muted-foreground)] z-10" />
                    </div>

                    <div className="flex flex-col min-w-0 max-w-[150px] sm:max-w-[200px]">
                        <span className="truncate font-medium text-[13px]">{file.name}</span>
                        {(file.status === 'uploading' || file.status === 'error') && (
                            <span className="text-[11px] opacity-70 flex items-center gap-1">
                                {file.status === 'uploading' && <span className="text-[var(--accent)]">Uploading…</span>}
                                {file.status === 'error' && <span className="text-destructive">Error</span>}
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => onRemove(file.id)}
                        className={`p-1 rounded-md shrink-0 transition-colors ml-1 ${file.status === 'error'
                            ? 'hover:bg-destructive/20 text-destructive'
                            : 'hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            }`}
                        title="Remove file"
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    )
}

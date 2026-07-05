import { useEffect, useState } from 'react'
import { X, File as FileIcon, Loader2, AlertCircle } from 'lucide-react'
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

function AttachmentThumbnail({ file }: { file: AttachedFile }) {
    const isImage = file.type.startsWith('image/')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)

    useEffect(() => {
        if (!isImage) return
        const url = URL.createObjectURL(file.file)
        setPreviewUrl(url)
        return () => URL.revokeObjectURL(url)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isImage, file.file])

    if (isImage && previewUrl) {
        return (
            <div className="shrink-0 relative w-8 h-8 rounded overflow-hidden border border-[var(--border-subtle)]">
                <img src={previewUrl} alt={file.name} className="absolute inset-0 h-full w-full object-cover" />
                <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${file.status === 'ready' ? 'opacity-0' : 'opacity-100'}`} />
                <Loader2 className={`absolute inset-0 m-auto h-4 w-4 text-white animate-spin transition-opacity duration-300 ${file.status === 'uploading' ? 'opacity-100' : 'opacity-0'}`} />
                <AlertCircle className={`absolute inset-0 m-auto h-4 w-4 text-white transition-opacity duration-300 ${file.status === 'error' ? 'opacity-100' : 'opacity-0'}`} />
            </div>
        )
    }

    return (
        <div className="shrink-0 relative w-8 h-8 rounded bg-[var(--background)] border border-[var(--border-subtle)] overflow-hidden">
            {/* Icon crossfades between states instead of snapping, so upload
                completion reads as a settle rather than a hard swap. */}
            <Loader2 className={`absolute inset-0 m-auto h-4 w-4 text-[var(--muted-foreground)] animate-spin transition-opacity duration-300 ${file.status === 'uploading' ? 'opacity-100' : 'opacity-0'}`} />
            <FileIcon className={`absolute inset-0 m-auto h-4 w-4 text-[var(--muted-foreground)] transition-opacity duration-300 ${file.status === 'ready' ? 'opacity-100' : 'opacity-0'}`} />
            <AlertCircle className={`absolute inset-0 m-auto h-4 w-4 text-destructive transition-opacity duration-300 ${file.status === 'error' ? 'opacity-100' : 'opacity-0'}`} />
        </div>
    )
}

export function FileUploadArea({ files, onRemove, className = '' }: FileUploadAreaProps) {
    const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

    if (!files || files.length === 0) return null

    const handleRemove = (localKey: string, id: string) => {
        setRemovingIds((prev) => new Set(prev).add(localKey))
        setTimeout(() => {
            onRemove(id)
            setRemovingIds((prev) => {
                const next = new Set(prev)
                next.delete(localKey)
                return next
            })
        }, 180)
    }

    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {files.map((file) => {
                const isRemoving = removingIds.has(file.localKey)
                return (
                    <div
                        key={file.localKey}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all duration-200 ease-out animate-in fade-in slide-in-from-bottom-1 ${isRemoving ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${file.status === 'error'
                            ? 'border-destructive/50 bg-destructive/10 text-destructive'
                            : file.status === 'ready'
                                ? 'border-[var(--border-subtle)] bg-[var(--secondary)]/50 text-[var(--foreground)]'
                                : 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--foreground)]'
                            }`}
                    >
                        <AttachmentThumbnail file={file} />

                        <div className="flex flex-col min-w-0 max-w-[150px] sm:max-w-[200px]">
                            <span className="truncate font-medium text-[13px]">{file.name}</span>
                            {(file.status === 'uploading' || file.status === 'error') && (
                                <span className="text-[11px] opacity-70 flex items-center gap-1">
                                    {file.status === 'uploading' && <span className="text-[var(--muted-foreground)]">Uploading…</span>}
                                    {file.status === 'error' && <span className="text-destructive">Error</span>}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => handleRemove(file.localKey, file.id)}
                            className={`p-1 rounded-md shrink-0 transition-colors ml-1 ${file.status === 'error'
                                ? 'hover:bg-destructive/20 text-destructive'
                                : 'hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                }`}
                            title="Remove file"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

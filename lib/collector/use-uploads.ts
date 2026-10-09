'use client'

import { useCallback, useState } from 'react'
import type { AttachedFile } from '@/hooks/useFileUpload'
import { ApiError, uploadFile } from './api'

/**
 * `useFileUpload` for the collector: the same `AttachedFile` records (so the chat's own
 * `FileUploadArea` chip draws them) and the same lifecycle, uploading through the
 * collector's endpoints instead of a signed-in user's.
 */
export function useCollectorUploads() {
  const [files, setFiles] = useState<AttachedFile[]>([])

  const remove = useCallback((id: string) => setFiles((prev) => prev.filter((f) => f.id !== id)), [])
  const clear = useCallback(() => setFiles([]), [])

  const upload = useCallback(async (file: File, threadId: string): Promise<string> => {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setFiles((prev) => [
      ...prev,
      { id: localId, localKey: localId, file, name: file.name, size: file.size, type: file.type, status: 'uploading', progress: 0 },
    ])
    try {
      const fileId = await uploadFile(threadId, file, (id, progress) =>
        setFiles((prev) => prev.map((f) => (f.id === localId || f.id === id ? { ...f, id, progress } : f))),
      )
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'ready', progress: 100 } : f)))
      return fileId
    } catch (e) {
      // the entry is addressed by whichever id it has by now: the local one, or the minted one
      setFiles((prev) => prev.map((f) => (f.status === 'uploading' && (f.id === localId || f.name === file.name) ? { ...f, status: 'error' } : f)))
      throw e instanceof ApiError || e instanceof Error ? e : new Error('Upload failed.')
    }
  }, [])

  return { files, setFiles, upload, remove, clear }
}

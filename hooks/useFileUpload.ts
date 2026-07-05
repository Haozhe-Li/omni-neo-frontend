import { useState, useCallback } from 'react'
import { useApi } from './useApi'
import { useAuth } from '@clerk/nextjs'

export type FileUploadStatus = 'uploading' | 'ready' | 'error'

export interface AttachedFile {
    id: string // Our generated local ID until we get the real one, then it's the real file_id
    localKey: string // Stable for the file's whole lifetime — use this as the React key, `id` changes mid-upload
    file: File
    name: string
    size: number
    type: string
    status: FileUploadStatus
    progress: number
}

export function useFileUpload() {
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
    const { fetchWithAuth } = useApi()
    const { isSignedIn } = useAuth()

    const removeFile = useCallback((id: string) => {
        setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
    }, [])

    const clearFiles = useCallback(() => {
        setAttachedFiles([])
    }, [])

    const uploadFile = useCallback(async (file: File, currentThreadId?: string) => {
        if (!isSignedIn) {
            throw new Error("Must be signed in to upload files")
        }

        const localId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

        setAttachedFiles((prev) => [
            ...prev,
            {
                id: localId,
                localKey: localId,
                file,
                name: file.name,
                size: file.size,
                type: file.type,
                status: 'uploading',
                progress: 0,
            }
        ])

        try {
            const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
            const uploadUrlEndpoint = baseUrl.endsWith('/') ? `${baseUrl}api/upload/url` : `${baseUrl}/api/upload/url`

            // 1. Get Presigned URL
            const urlResponse = await fetchWithAuth(uploadUrlEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    file_type: file.type,
                    file_size_bytes: file.size,
                    thread_id: currentThreadId
                })
            })

            if (!urlResponse.ok) {
                throw new Error("Failed to get upload URL")
            }

            const urlData = await urlResponse.json()
            const { upload_url, file_id } = urlData

            // Update local ID to actual file_id, keep status uploading
            setAttachedFiles((prev) =>
                prev.map(f => f.id === localId ? { ...f, id: file_id, progress: 33 } : f)
            )

            // 2. Direct Upload to S3
            // We don't use fetchWithAuth here because it's an external S3 URL
            const s3Response = await fetch(upload_url, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type, // Must match API #1
                },
                body: file
            })

            if (!s3Response.ok) {
                throw new Error("Direct upload to S3 failed")
            }

            setAttachedFiles((prev) =>
                prev.map(f => f.id === file_id ? { ...f, progress: 66 } : f)
            )

            // 3. Confirm with Backend
            const confirmEndpoint = baseUrl.endsWith('/') ? `${baseUrl}api/upload/confirm?file_id=${file_id}` : `${baseUrl}/api/upload/confirm?file_id=${file_id}`
            const confirmResponse = await fetchWithAuth(confirmEndpoint, {
                method: 'POST'
            })

            if (!confirmResponse.ok) {
                throw new Error("Backend confirm failed")
            }

            // Success! Update status to ready
            setAttachedFiles((prev) =>
                prev.map(f => f.id === file_id ? { ...f, status: 'ready', progress: 100 } : f)
            )

            return file_id

        } catch (err) {
            console.error("File upload error:", err)
            // On error, try to update status of either localId or file_id (whichever state we are in)
            setAttachedFiles((prev) =>
                prev.map(f => (f.id === localId || (f.status === 'uploading' && f.name === file.name))
                    ? { ...f, status: 'error' }
                    : f
                )
            )
            throw err
        }
    }, [fetchWithAuth, isSignedIn])

    return {
        attachedFiles,
        setAttachedFiles,
        uploadFile,
        removeFile,
        clearFiles
    }
}

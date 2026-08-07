// Shared upload allow-list for both composers (search-home.tsx, chat-view.tsx).
// Mirrors the backend's own allow-list (core/routers/uploads.py) — extension
// OR MIME, since browsers report unreliable/generic MIME types for a lot of
// office/legacy formats. Keep the two in sync when either changes.

// Formats the backend converts to Markdown via anydoc before mounting.
export const DOCUMENT_EXTENSIONS = [
    '.pdf',
    '.doc', '.docx', '.docm',
    '.ppt', '.pps', '.pot', '.pptx', '.pptm', '.ppsx', '.ppsm',
    '.xls', '.xlsx', '.xlsm', '.xlsb',
    '.odt', '.ods', '.odp',
    '.rtf', '.epub',
]

export const DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroEnabled.12',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
    'text/rtf',
    'application/epub+zip',
]

// Plain-text/code — read as-is, no anydoc conversion.
export const TEXT_EXTENSIONS = [
    '.txt', '.md', '.csv', '.py', '.js', '.jsx', '.ts', '.tsx', '.html',
    '.json', '.xml', '.yaml', '.yml', '.java', '.c', '.cpp', '.h', '.hpp', '.sh',
]

export const TEXT_MIME_TYPES = [
    'text/plain', 'text/markdown', 'text/html', 'application/json',
    'application/xml', 'text/xml', 'application/yaml', 'application/x-yaml', 'text/yaml',
]

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png']
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png']

export const ALLOWED_UPLOAD_EXTENSIONS = [...DOCUMENT_EXTENSIONS, ...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS]
export const ALLOWED_UPLOAD_MIME_TYPES = [...DOCUMENT_MIME_TYPES, ...TEXT_MIME_TYPES, ...IMAGE_MIME_TYPES]

export const UPLOAD_ACCEPT_ATTR = [...ALLOWED_UPLOAD_EXTENSIONS, ...ALLOWED_UPLOAD_MIME_TYPES].join(',')

export function isAllowedUploadFile(file: File): boolean {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    return ALLOWED_UPLOAD_MIME_TYPES.includes(file.type) || ALLOWED_UPLOAD_EXTENSIONS.includes(ext)
}

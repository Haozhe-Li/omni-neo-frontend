import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { s3 } from '@/lib/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'

// Helper to migrate images from shortly.haozheli.com to R2
async function migrateImages(content: any, expires?: Date): Promise<any> {
    const contentStr = JSON.stringify(content)
    // Match any shortly.haozheli.com URL - including dots for extensions if present
    const regex = /https:\/\/shortly\.haozheli\.com\/[a-zA-Z0-9.\-_]+/g
    const matches = contentStr.match(regex)

    if (!matches) return content

    let updatedContentStr = contentStr
    // Sort matches by length descending to ensure we replace longer URLs first
    const uniqueMatches = Array.from(new Set(matches)).sort((a, b) => b.length - a.length)

    const extensionMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
    }

    for (const url of uniqueMatches) {
        try {
            // Download image - use a common user agent to avoid being blocked
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            })
            if (!response.ok) {
                console.error(`Failed to fetch ${url}: ${response.statusText}`)
                continue
            }

            const contentType = response.headers.get('content-type') || 'image/png'
            if (!contentType.startsWith('image/')) {
                console.warn(`URL ${url} is not an image (Content-Type: ${contentType})`)
                continue
            }

            const buffer = await response.arrayBuffer()

            // Extract a clean slug for the filename
            let slug = url.split('/').pop()!
            // If it contains an extension, strip it so we can add the correct one deterministically
            if (slug.includes('.')) {
                slug = slug.split('.').slice(0, -1).join('.')
            }

            const ext = extensionMap[contentType] || contentType.split('/')[1] || 'png'
            const filename = `${slug}.${ext}`

            // Upload to R2 "omni" bucket
            await s3.send(new PutObjectCommand({
                Bucket: 'omni',
                Key: `public/${filename}`,
                Body: Buffer.from(buffer),
                ContentType: contentType,
                Expires: expires, // Set S3 object expiration date
            }))

            // Replace URL in content with the new permanent R2 URL
            const newUrl = `https://cdn.omniknows.xyz/public/${filename}`
            // We use split/join to globally replace the exact URL
            updatedContentStr = updatedContentStr.split(url).join(newUrl)
        } catch (error) {
            console.error(`Failed to migrate image ${url}:`, error)
        }
    }

    return JSON.parse(updatedContentStr)
}

export async function POST(request: Request) {
    try {
        const rawData = await request.json()
        const { duration } = rawData

        // Calculate TTL in seconds
        let ttlSeconds: number | null = null
        let expiresDate: Date | undefined = undefined

        if (duration === '7d') {
            ttlSeconds = 7 * 24 * 60 * 60
        } else if (duration === '30d') {
            ttlSeconds = 30 * 24 * 60 * 60
        }

        if (ttlSeconds) {
            expiresDate = new Date(Date.now() + ttlSeconds * 1000)
        }

        // 1. Migrate images that are about to expire
        const data = await migrateImages(rawData, expiresDate)

        // 2. Generate a deterministic hash for the ID
        const contentStr = JSON.stringify(data)
        const encoder = new TextEncoder()
        const contentData = encoder.encode(contentStr)
        const hashBuffer = await crypto.subtle.digest('SHA-256', contentData)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        const id = hashHex.slice(0, 12)

        // 3. Store in Redis with TTL if set
        if (ttlSeconds) {
            await redis.set(`publish:${id}`, contentStr, { ex: ttlSeconds })
        } else {
            await redis.set(`publish:${id}`, contentStr)
        }

        return NextResponse.json({ id })
    } catch (error) {
        console.error('Failed to publish report:', error)
        return NextResponse.json({ error: 'Failed to publish report' }, { status: 500 })
    }
}

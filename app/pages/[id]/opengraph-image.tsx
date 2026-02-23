import { ImageResponse } from 'next/og'
import { redis } from '@/lib/redis'

// Route segment config
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Image metadata
export const alt = 'Omni Knows Pages'
export const size = {
    width: 1200,
    height: 630,
}

export const contentType = 'image/png'

// Image generation
export default async function Image({ params }: { params: Promise<{ id: string }> | { id: string } }) {
    // Handle params whether it's a Promise or not
    const resolvedParams = await params
    const id = resolvedParams?.id

    let title = 'AI Research Report'

    if (id) {
        try {
            const rawData = await redis.get(`publish:${id}`)
            if (rawData) {
                const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
                title = data.title || 'AI Research Report'
            }
        } catch (error) {
            console.error('Failed to fetch title for OG image:', error)
        }
    }

    // Get characters for display, only truncate if exceeds 30
    const displayTitle = title.length > 30 ? title.slice(0, 30).trim() + '...' : title
    const len = displayTitle.length

    // Dynamically adjust font size based on length
    let fontSize = 110
    if (len <= 4) fontSize = 200
    else if (len <= 7) fontSize = 180
    else if (len <= 10) fontSize = 140
    else if (len <= 14) fontSize = 110
    else if (len <= 20) fontSize = 90
    else fontSize = 80

    const siteUrl = 'https://omniknows.xyz'
    // Use a static background image URL to avoid caching issues and unnecessary fetches
    const backgroundImage = `${siteUrl}/omniknows_canvas.png`

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    padding: '80px',
                    backgroundColor: '#000',
                    backgroundImage: `url(${backgroundImage})`,
                    backgroundSize: '1200px 630px',
                    backgroundPosition: 'center',
                    position: 'relative',
                }}
            >
                {/* Main Title - Left Aligned Top-Left */}
                <div
                    style={{
                        display: 'flex',
                        fontSize: `${fontSize}px`,
                        fontWeight: 900,
                        color: '#ffffff',
                        textAlign: 'left',
                        lineHeight: 1.1,
                        letterSpacing: '-0.05em',
                        textTransform: 'none',
                        fontFamily: 'sans-serif',
                        textShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        maxWidth: '1000px',
                    }}
                >
                    {displayTitle}
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}

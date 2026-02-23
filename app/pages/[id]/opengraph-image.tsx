import { ImageResponse } from 'next/og'
import { redis } from '@/lib/redis'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const alt = 'Omni Knows Pages'
export const size = {
    width: 1200,
    height: 630,
}

export const contentType = 'image/png'

// Image generation
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let title = 'AI Research Report'
    try {
        const rawData = await redis.get(`publish:${id}`)
        if (rawData) {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData
            title = data.title || 'AI Research Report'
        }
    } catch (error) {
        console.error('Failed to fetch title for OG image:', error)
    }

    // Get first 20 characters, only truncate if exceeds 20
    const displayTitle = title.length > 20 ? title.slice(0, 20).trim() + '...' : title
    const len = displayTitle.length

    // Dynamically adjust font size based on length
    let fontSize = 110
    if (len <= 4) fontSize = 240
    else if (len <= 7) fontSize = 200
    else if (len <= 10) fontSize = 160
    else if (len <= 14) fontSize = 130
    else if (len <= 17) fontSize = 110
    else fontSize = 100

    // Use local URL in development, production URL in build
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const backgroundImage = `${siteUrl}/omniknows_canvas.png?v=${Date.now()}`

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

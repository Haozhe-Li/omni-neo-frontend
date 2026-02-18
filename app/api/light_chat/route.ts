import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const { query, thread_id } = await request.json()

        if (!query) {
            return new Response('Query is required', { status: 400 })
        }

        // TODO: Replace with your actual backend endpoint
        const BACKEND_URL = process.env.BACKEND_URL || 'http://your-backend-url.com'
        const targetUrl = BACKEND_URL.endsWith('/') ? `${BACKEND_URL}light_chat` : `${BACKEND_URL}/light_chat`

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, thread_id }),
        })

        if (!response.ok) {
            // Stream error text back if backend provides details
            const errorText = await response.text()
            throw new Error(`Backend responded with status ${response.status}: ${errorText}`)
        }

        const data = await response.json()
        return NextResponse.json(data)
    } catch (error: any) {
        console.error('Error in light_chat API:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}

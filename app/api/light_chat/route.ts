import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json()
        const { query } = payload

        if (!query) {
            return new Response('Query is required', { status: 400 })
        }

        const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'
        const targetUrl = backendBaseUrl.endsWith('/') ? `${backendBaseUrl}light_chat` : `${backendBaseUrl}/light_chat`

        const authHeader = request.headers.get('authorization')
        const guestHeader = request.headers.get('x-guest-id')
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (authHeader) headers['Authorization'] = authHeader
        if (guestHeader) headers['X-Guest-Id'] = guestHeader

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errorText = await response.text()
            return new Response(errorText || 'Request failed', {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            })
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

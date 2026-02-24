import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    try {
        const backendBaseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000'
        const targetUrl = backendBaseUrl.endsWith('/') ? `${backendBaseUrl}get_thread_id` : `${backendBaseUrl}/get_thread_id`

        const authHeader = request.headers.get('authorization')
        const guestHeader = request.headers.get('x-guest-id')
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (authHeader) headers['Authorization'] = authHeader
        if (guestHeader) headers['X-Guest-Id'] = guestHeader

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers,
        })

        if (!response.ok) {
            console.warn(`Backend responded with status: ${response.status}`)
            const errorText = await response.text()
            return new Response(errorText || 'Request failed', { status: response.status })
        }

        const data = await response.json()
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        })
    } catch (error) {
        console.error('Error in get_thread_id API:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
}

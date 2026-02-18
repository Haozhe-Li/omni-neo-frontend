import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    try {
        // TODO: Replace with your actual backend endpoint
        const BACKEND_URL = process.env.BACKEND_URL || 'http://your-backend-url.com'
        const targetUrl = BACKEND_URL.endsWith('/') ? `${BACKEND_URL}get_thread_id` : `${BACKEND_URL}/get_thread_id`

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        if (!response.ok) {
            // If backend fails, maybe return a generated UUID or error?
            // For now, let's propagate the error or return a fallback
            console.warn(`Backend responded with status: ${response.status}`)
            // Fallback ID generation if backend is down but we want to proceed?
            // return new Response(JSON.stringify({ thread_id: crypto.randomUUID() }), { status: 200 })
            throw new Error(`Backend responded with status: ${response.status}`)
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

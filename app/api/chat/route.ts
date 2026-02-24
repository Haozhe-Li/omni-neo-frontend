import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const { query } = payload

    if (!query) {
      return new Response('Query is required', { status: 400 })
    }

    const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    const targetUrl = backendBaseUrl.endsWith('/') ? `${backendBaseUrl}chat` : `${backendBaseUrl}/chat`

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
      return new Response(errorText || 'Request failed', { status: response.status })
    }

    // Stream the response back to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error in chat API:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

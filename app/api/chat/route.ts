import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { query, thread_id } = await request.json()

    if (!query) {
      return new Response('Query is required', { status: 400 })
    }

    // TODO: Replace with your actual backend endpoint
    const BACKEND_URL = process.env.BACKEND_URL || 'http://your-backend-url.com/chat'

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, thread_id }),
    })

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
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

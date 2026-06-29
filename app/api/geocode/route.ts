import { NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

const CACHE_TTL = 60 * 60 * 24 * 90 // 90 days — places rarely move

async function geocodeOne(name: string): Promise<{ lat: number; lng: number } | null> {
  const cacheKey = `omni:geocode:v2:${name}`

  const cached = await redis.get<{ lat: number; lng: number } | 'null'>(cacheKey)
  if (cached === 'null') return null
  if (cached) return cached

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(name)}&key=${process.env.GOOGLE_GEOCODE_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
    const { lat, lng } = data.results[0].geometry.location
    const coords = { lat, lng }
    await redis.set(cacheKey, coords, { ex: CACHE_TTL })
    return coords
  }

  // Cache misses too so repeated unknown queries don't burn API quota.
  await redis.set(cacheKey, 'null', { ex: CACHE_TTL })
  return null
}

export async function POST(request: Request) {
  try {
    const { names } = await request.json()
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ error: 'names must be a non-empty array' }, { status: 400 })
    }

    // Google Geocoding API is server-side keyed — safe to run in parallel.
    const results = await Promise.all(
      names.map(async (name: string) => ({
        name,
        coords: await geocodeOne(String(name)),
      }))
    )

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[geocode] error:', error)
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 })
  }
}

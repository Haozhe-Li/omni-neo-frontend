export interface LocationData {
    value: string
    type: 'ip' | 'gps'
    timestamp: number
}

const STORAGE_KEY = 'omni_user_location_data'
const FAIL_KEY = 'omni_user_location_fail_at'
const STALE_AFTER_MS = 24 * 60 * 60 * 1000
// Both lookups are third-party services (ipapi.co, Nominatim) with no SLA, and
// ipapi.co in particular is slow or unreachable from some regions. Cap how long
// we wait on either, and after a failed automatic refresh leave them alone for a
// while — a failure is not written to the cache, so without this every message
// would retry (and wait on) the same dead endpoint.
const FETCH_TIMEOUT_MS = 1000
const FAIL_BACKOFF_MS = 10 * 60 * 1000

async function fetchJson(url: string): Promise<any> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`location lookup failed: ${res.status}`)
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}

async function fetchIPLocation(): Promise<string> {
    const data = await fetchJson('https://ipapi.co/json/')
    const city = data.city || data.region || 'Unknown City'
    const country = data.country_name || 'Unknown Country'
    return `${city}, ${country} (IP Approximate)`
}

function fetchGPSLocation(): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported"))
            return
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const { latitude, longitude } = pos.coords
                    const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || 'Unknown City'
                    const country = data.address?.country || 'Unknown Country'
                    resolve(`${city}, ${country} (GPS Precise Location)`)
                } catch (e) {
                    reject(e)
                }
            },
            (err) => reject(err)
        )
    })
}

function readStored(): LocationData | null {
    const storedStr = localStorage.getItem(STORAGE_KEY)
    if (!storedStr) return null
    try {
        return JSON.parse(storedStr)
    } catch (e) {
        return null
    }
}

function inFailureBackoff(): boolean {
    const at = Number(localStorage.getItem(FAIL_KEY))
    return !!at && Date.now() - at < FAIL_BACKOFF_MS
}

// Concurrent automatic refreshes (a send and a settings panel, say) share one
// network lookup instead of racing two.
let autoRefresh: Promise<LocationData | null> | null = null

/**
 * The location to attach to a chat turn, WITHOUT waiting for the network: the
 * stored value (even a stale one — a city doesn't go off in a day) or null.
 * When it is missing or stale, a refresh is started in the background so the
 * next turn has it. A turn never waits on a third-party geolocation service.
 */
export function getUserLocationNow(): LocationData | null {
    if (typeof window === 'undefined') return null
    const stored = readStored()
    const isStale = !stored || Date.now() - stored.timestamp > STALE_AFTER_MS
    if (isStale && !inFailureBackoff()) {
        void getUserLocation(false).catch(() => {})
    }
    return stored
}

export async function getUserLocation(forceRefresh = false, requestedType?: 'ip' | 'gps'): Promise<LocationData | null> {
    if (typeof window === 'undefined') return null

    const automatic = !forceRefresh && !requestedType
    if (automatic) {
        if (autoRefresh) return autoRefresh
        autoRefresh = lookup(forceRefresh, requestedType).finally(() => {
            autoRefresh = null
        })
        return autoRefresh
    }
    return lookup(forceRefresh, requestedType)
}

async function lookup(forceRefresh: boolean, requestedType?: 'ip' | 'gps'): Promise<LocationData | null> {
    const storedData = readStored()

    const now = Date.now()
    const isStale = storedData ? (now - storedData.timestamp > STALE_AFTER_MS) : true

    // If we don't need a refresh and no explicit type is forced, return what we have
    if (!forceRefresh && !isStale && storedData && (!requestedType || requestedType === storedData.type)) {
        return storedData
    }
    // A recent automatic attempt failed: keep what we have rather than retry now.
    // An explicit request (forced refresh / chosen type) always goes to the network.
    if (!forceRefresh && !requestedType && inFailureBackoff()) {
        return storedData
    }

    // Determine what type to fetch
    let typeToFetch = requestedType || (storedData?.type || 'ip')
    let newValue = ''

    try {
        if (typeToFetch === 'gps') {
            newValue = await fetchGPSLocation()
        } else {
            newValue = await fetchIPLocation()
        }
    } catch (error) {
        // If GPS fails (e.g., denied), fallback to IP
        if (typeToFetch === 'gps') {
            try {
                newValue = await fetchIPLocation()
                typeToFetch = 'ip'
            } catch (e) {
                localStorage.setItem(FAIL_KEY, String(Date.now()))
                return storedData // totally failed
            }
        } else {
            localStorage.setItem(FAIL_KEY, String(Date.now()))
            return storedData
        }
    }

    const newLocationData: LocationData = {
        value: newValue,
        type: typeToFetch,
        timestamp: Date.now()
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newLocationData))
    localStorage.removeItem(FAIL_KEY)
    return newLocationData
}

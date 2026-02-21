export interface LocationData {
    value: string
    type: 'ip' | 'gps'
    timestamp: number
}

async function fetchIPLocation(): Promise<string> {
    const res = await fetch('https://ipapi.co/json/')
    const data = await res.json()
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
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                    const data = await res.json()
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

export async function getUserLocation(forceRefresh = false, requestedType?: 'ip' | 'gps'): Promise<LocationData | null> {
    if (typeof window === 'undefined') return null

    const storedStr = localStorage.getItem('omni_user_location_data')
    let storedData: LocationData | null = null
    if (storedStr) {
        try {
            storedData = JSON.parse(storedStr)
        } catch (e) { }
    }

    const now = Date.now()
    const isStale = storedData ? (now - storedData.timestamp > 24 * 60 * 60 * 1000) : true

    // If we don't need a refresh and no explicit type is forced, return what we have
    if (!forceRefresh && !isStale && storedData && (!requestedType || requestedType === storedData.type)) {
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
                return storedData // totally failed
            }
        } else {
            return storedData
        }
    }

    const newLocationData: LocationData = {
        value: newValue,
        type: typeToFetch,
        timestamp: Date.now()
    }

    localStorage.setItem('omni_user_location_data', JSON.stringify(newLocationData))
    return newLocationData
}

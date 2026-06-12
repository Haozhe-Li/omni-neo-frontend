'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/* ─── types ─── */

export interface LightChatMapPoint {
  id: string
  name: string
  lat: number
  lng: number
  position?: number
  url?: string
  address?: string
  rating?: number
  reviewCount?: number
  priceLevel?: string
  category?: string
  status?: string
  imageUrl?: string
  cid?: string
}

/* ─── helpers ─── */

function googleMapsUrl(point: LightChatMapPoint) {
  if (point.cid) return `https://www.google.com/maps?cid=${point.cid}`
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`
}

function makeIcon(n: number, active: boolean) {
  const s = active ? 30 : 24
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:${active ? 13 : 11}px;font-weight:700;letter-spacing:-0.01em;color:#fff;background:${active ? 'var(--accent,#005a5a)' : '#1a1a1a'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.25);pointer-events:auto;transition:all .15s ease">${n}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  })
}

/* ─── sub-components ─── */

function FitBounds({ points }: { points: LightChatMapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14)
      return
    }
    map.fitBounds(
      L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40] },
    )
  }, [map, points])
  return null
}

/* ─── main ─── */

export function LightChatMiniMap({ points }: { points: LightChatMapPoint[] }) {
  if (!points.length) return null

  const listRef = useRef<HTMLDivElement>(null)

  const ordered = useMemo(
    () => [...points].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)),
    [points],
  )

  const [activeId, setActiveId] = useState<string | null>(null)

  /* scroll the active card into view when hovering a marker */
  useEffect(() => {
    if (!activeId || !listRef.current) return
    const card = listRef.current.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeId])

  const center: [number, number] = [ordered[0].lat, ordered[0].lng]

  return (
    <div className="w-full flex flex-col bg-transparent">
      {/* ── map ── */}
      <div className="relative h-64 sm:h-80 shrink-0 border-b border-[var(--border-subtle)]/40">
        <MapContainer
          center={center}
          zoom={13}
          className="h-full w-full z-0"
          scrollWheelZoom={false}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <FitBounds points={points} />

          {ordered.map((p, i) => {
            const num = p.position ?? i + 1
            const isActive = activeId === p.id
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={makeIcon(num, isActive)}
                eventHandlers={{
                  mouseover: () => setActiveId(p.id),
                  mouseout: () => setActiveId((c) => (c === p.id ? null : c)),
                  click: () => window.open(googleMapsUrl(p), '_blank'),
                }}
              >
                <Tooltip direction="top" offset={[0, -16]} opacity={1} permanent={isActive}>
                  <span className="text-xs font-medium">{p.name}</span>
                </Tooltip>
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      {/* ── place list ── */}
      <div ref={listRef} className="max-h-96 overflow-y-auto divide-y divide-[var(--border-subtle)] bg-[var(--card)]">
        {ordered.map((p, i) => {
          const num = p.position ?? i + 1
          const isActive = activeId === p.id
          const subtitle = [p.category, p.address].filter(Boolean).join(' · ')

          return (
            <a
              key={p.id}
              data-id={p.id}
              href={googleMapsUrl(p)}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={() => setActiveId(p.id)}
              onMouseLeave={() => setActiveId((c) => (c === p.id ? null : c))}
              className={`flex items-center gap-3 px-3.5 py-2.5 no-underline transition-colors ${
                isActive ? 'bg-[var(--accent)]/[0.05]' : 'hover:bg-[var(--secondary)]/40'
              }`}
            >
              {/* number badge */}
              <span
                className={`flex-none w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--foreground)]/80 text-[var(--background)]'
                }`}
              >
                {num}
              </span>

              {/* name + subtitle */}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[var(--foreground)] leading-snug line-clamp-1">
                  {p.name}
                </p>
                {subtitle && (
                  <p className="text-xs text-[var(--muted-foreground)] leading-snug mt-0.5 line-clamp-1">
                    {subtitle}
                  </p>
                )}
              </div>

              {/* rating + price */}
              <div className="flex-none flex flex-col items-end gap-0.5">
                {p.rating != null && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-medium text-[var(--foreground)]">{p.rating.toFixed(1)}</span>
                    {p.reviewCount != null && (
                      <span className="text-[var(--muted-foreground)]">({p.reviewCount.toLocaleString()})</span>
                    )}
                  </span>
                )}
                {p.priceLevel && (
                  <span className="text-[11px] text-[var(--muted-foreground)]">{p.priceLevel}</span>
                )}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

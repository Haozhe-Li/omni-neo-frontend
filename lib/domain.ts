import { parse } from 'tldts'

// Short "brand" label for a URL — the registrable domain with its subdomain
// and public suffix stripped, e.g. "https://wuu.wikipedia.org/x" -> "wikipedia".
// Uses tldts' bundled public suffix list so compound suffixes (`.gov.uk`,
// `.co.uk`, `.com.cn`, ...) resolve correctly instead of a naive "last label"
// guess misreading them as the brand (e.g. "service.gov.uk" -> "gov").
// Falls back to the plain hostname, then the raw input, if parsing fails.
export function brandDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname
    const { domainWithoutSuffix } = parse(hostname)
    return domainWithoutSuffix || hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Label for a document-sourced citation/source card: the filename, capped so
// a long one doesn't just rely on CSS truncation. `keepExtension` is false
// for the compact inline citation pill (no room for it) and true everywhere
// else (source cards, hover-card detail) where the extension is useful info.
export function truncateFilename(filename: string, max: number, keepExtension: boolean): string {
  const base = keepExtension ? filename : filename.replace(/\.[^./\\]+$/, '')
  return base.length > max ? `${base.slice(0, max)}…` : base
}

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

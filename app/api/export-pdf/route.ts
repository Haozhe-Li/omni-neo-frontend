import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { marked } from 'marked'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 60

// Read the icon and encode it as base64 for embedding
function getIconBase64(): string {
  try {
    const iconPath = path.join(process.cwd(), 'public', 'android-chrome-192x192.png')
    const iconBuffer = fs.readFileSync(iconPath)
    return `data:image/png;base64,${iconBuffer.toString('base64')}`
  } catch {
    return ''
  }
}

function buildHtml(markdownContent: string, title: string, iconBase64: string, sources: Array<{ title: string; url: string }> = []): string {
  // Configure marked for GFM
  marked.setOptions({ gfm: true, breaks: true })
  const bodyHtml = marked.parse(markdownContent) as string

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    /* ── Variables & Reset ── */
    :root {
      --bg: #f5f4ef;
      --bg-card: #eeede8;
      --text: #1a1a18;
      --text-muted: #6b6b60;
      --accent: #20B2AA;
      --border: rgba(0,0,0,0.10);
      --code-bg: #e8e7e2;
      --font-sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      --font-mono: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 11pt;
      line-height: 1.75;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Page layout ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 0;
    }

    .content {
      padding: 14mm 18mm 20mm 18mm;
    }

    /* ── Header (printed via @page margin but we use a fixed div for first page) ── */
    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10mm 18mm 8mm 18mm;
      border-bottom: 1px solid var(--border);
      margin-bottom: 10mm;
    }

    .report-header .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .report-header .brand img {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }

    .report-header .brand-name {
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: var(--text);
    }

    .report-header .doc-type {
      font-size: 8pt;
      color: var(--text-muted);
      letter-spacing: 0.8px;
      text-transform: uppercase;
      font-weight: 500;
    }

    /* ── Report title block ── */
    .report-title-block {
      margin-bottom: 10mm;
      padding-bottom: 6mm;
      border-bottom: 2px solid var(--accent);
    }

    .report-title-block h1 {
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: -0.5px;
      color: var(--text);
      margin: 0 0 4px 0;
    }

    .report-meta {
      display: flex;
      gap: 18px;
      align-items: center;
      margin-top: 6px;
    }

    .report-meta span {
      font-size: 8.5pt;
      color: var(--text-muted);
    }

    .report-meta .badge {
      background: var(--accent);
      color: #fff;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 7.5pt;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    /* ── Typography ── */
    h1, h2, h3, h4 {
      color: var(--text);
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: -0.3px;
    }

    h1 { font-size: 17pt; margin: 12mm 0 4mm; }
    h2 { font-size: 14pt; margin: 9mm 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid var(--border); }
    h3 { font-size: 12pt; margin: 7mm 0 2mm; }
    h4 { font-size: 10.5pt; margin: 5mm 0 2mm; }

    p { margin-bottom: 4mm; color: var(--text); }

    a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }

    strong { font-weight: 700; }
    em { font-style: italic; color: var(--text-muted); }

    /* ── Lists ── */
    ul, ol {
      margin: 2mm 0 4mm 5mm;
      padding-left: 5mm;
    }

    li {
      margin-bottom: 1.5mm;
      line-height: 1.7;
    }

    ul li::marker { color: var(--accent); }
    ol li::marker { color: var(--accent); font-weight: 600; }

    /* ── Blockquote ── */
    blockquote {
      margin: 4mm 0;
      padding: 3mm 5mm;
      border-left: 3px solid var(--accent);
      background: var(--bg-card);
      border-radius: 0 6px 6px 0;
      color: var(--text-muted);
      font-style: italic;
    }

    /* ── Code ── */
    code {
      font-family: var(--font-mono);
      font-size: 9pt;
      background: var(--code-bg);
      padding: 1px 5px;
      border-radius: 3px;
      color: var(--accent);
    }

    pre {
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 8px;
      padding: 4mm 5mm;
      margin: 4mm 0;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 8.5pt;
      line-height: 1.6;
    }

    pre code {
      background: none;
      color: inherit;
      padding: 0;
      border-radius: 0;
    }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4mm 0;
      font-size: 9.5pt;
    }

    th {
      background: var(--bg-card);
      color: var(--text);
      font-weight: 700;
      font-size: 8.5pt;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      text-align: left;
      padding: 2.5mm 3.5mm;
      border-bottom: 2px solid var(--border);
    }

    td {
      padding: 2mm 3.5mm;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    tr:nth-child(even) td { background: rgba(0,0,0,0.02); }

    /* ── HR ── */
    hr {
      border: none;
      height: 1px;
      background: var(--border);
      margin: 8mm 0;
    }

    /* ── Images ── */
    .body-content img {
      max-width: 60%;
      max-height: 120mm;
      width: auto;
      height: auto;
      border-radius: 6px;
      margin: 3mm auto;
      display: block;
    }

    /* ── Sources ── */
    .sources-section {
      margin-top: 12mm;
      padding-top: 6mm;
      border-top: 2px solid var(--border);
    }

    .sources-section h2 {
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--text-muted);
      border-bottom: none;
      margin: 0 0 4mm 0;
      padding-bottom: 0;
    }

    .source-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 2.5mm 0;
      border-bottom: 1px solid var(--border);
    }

    .source-item:last-child { border-bottom: none; }

    .source-num {
      font-size: 8pt;
      font-weight: 700;
      color: var(--accent);
      min-width: 20px;
      padding-top: 1px;
    }

    .source-info { flex: 1; min-width: 0; }

    .source-title {
      font-size: 9.5pt;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      display: block;
      margin-bottom: 1px;
    }

    .source-url {
      font-size: 8pt;
      color: var(--accent);
      word-break: break-all;
      text-decoration: none;
      opacity: 0.8;
    }

    /* ── Sources: force new page ── */
    .sources-section {
      margin-top: 0;
      padding-top: 6mm;
      border-top: 2px solid var(--border);
      page-break-before: always;
      break-before: page;
    }

    /* ── Print ── */
    @media print {
      @page {
        size: A4;
        /* margins give space for Puppeteer header/footer */
        margin-top: 22mm;
        margin-bottom: 20mm;
        margin-left: 0;
        margin-right: 0;
      }
      pre, blockquote, table { page-break-inside: avoid; }
      h1, h2, h3 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="content">
      <!-- Title Block -->
      <div class="report-title-block">
        <h1>${escapeHtml(title)}</h1>
        <div class="report-meta">
          <span class="badge">Deep Research</span>
          <span>Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>Powered by Omni</span>
        </div>
      </div>

      <!-- Body -->
      <div class="body-content">
        ${bodyHtml}
      </div>

      ${sources.length > 0 ? `
      <!-- Sources (new page) -->
      <div class="sources-section">
        <h2>References &amp; Sources</h2>
        ${sources.map((s: { title: string; url: string }, idx: number) => `
        <div class="source-item">
          <span class="source-num">[${idx + 1}]</span>
          <div class="source-info">
            <span class="source-title">${escapeHtml(s.title || 'Untitled')}</span>
            <a class="source-url" href="${escapeHtml(s.url)}">${escapeHtml(s.url)}</a>
          </div>
        </div>`).join('')}
      </div>` : ''}
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { markdown, title = 'Research Report', sources = [] } = body

    if (!markdown || typeof markdown !== 'string') {
      return NextResponse.json({ error: 'Missing markdown content' }, { status: 400 })
    }

    const iconBase64 = getIconBase64()
    const html = buildHtml(markdown, title, iconBase64, sources)

    let browser;
    const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

    if (isVercel) {
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      })
    } else {
      // Local development
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
          '--disable-web-security',
        ],
        // You might need to specify the path to your local Chrome/Chromium here if puppeteer-core can't find it
        // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 
      })
    }

    const page = await browser.newPage()

    // Accept Chinese content and allow Google Fonts to load
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' })
    // Use domcontentloaded instead of networkidle0 to avoid hanging on slow resources
    await page.setContent(html, { waitUntil: 'domcontentloaded' })

    // Wait for web fonts (Noto Sans SC etc.) to finish loading
    await page.evaluateHandle('document.fonts.ready')

    // Give images up to 5 seconds to load, then proceed anyway to prevent hanging
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const images = Array.from(document.querySelectorAll('img'))
        if (images.length === 0) { resolve(); return }

        let remaining = images.length
        const IMAGE_TIMEOUT_MS = 5000

        const done = () => { if (--remaining <= 0) resolve() }

        images.forEach((img) => {
          if (img.complete && img.naturalWidth > 0) {
            done()
            return
          }

          const timer = setTimeout(() => {
            replaceBroken(img)
            done()
          }, IMAGE_TIMEOUT_MS)

          img.addEventListener('load', () => { clearTimeout(timer); done() }, { once: true })
          img.addEventListener('error', () => { clearTimeout(timer); replaceBroken(img); done() }, { once: true })
        })

        function replaceBroken(img: HTMLImageElement) {
          const alt = img.alt || 'Image unavailable'
          const placeholder = document.createElement('div')
          placeholder.style.cssText =
            'padding:12px 16px;background:#e8e7e2;border:1px dashed #c0bfba;border-radius:6px;' +
            'color:#6b6b60;font-size:9pt;text-align:center;margin:3mm auto;max-width:60%;'
          placeholder.textContent = `[${alt}]`
          img.replaceWith(placeholder)
        }
      })
    })

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '22mm', right: '18mm', bottom: '20mm', left: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="
          width: 100%; padding: 0 18mm; box-sizing: border-box;
          display: flex; align-items: center; justify-content: space-between;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 8pt; color: #6b6b60;
          background-color: #f5f4ef;
          padding-bottom: 3mm; padding-top: 4mm;
        ">
          <div style="display:flex;align-items:center;gap:6px;">
            ${iconBase64 ? `<img src="${iconBase64}" style="width:14px;height:14px;border-radius:4px;opacity:0.7;" />` : ''}
            <span style="font-weight:700;color:#1a1a18;font-size:8pt;">Omni</span>
            <span style="opacity:0.5;font-size:7pt;margin-left:2px;">Canvas Report</span>
          </div>
          <span style="font-size:7.5pt;opacity:0.55;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      `,
      footerTemplate: `
        <div style="
          width: 100%; padding: 0 18mm; box-sizing: border-box;
          display: flex; align-items: center; justify-content: space-between;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 7.5pt; color: #6b6b60;
          background-color: #f5f4ef;
          padding-top: 3mm; padding-bottom: 4mm;
        ">
          <span style="opacity:0.5;">AI-generated · Omni Deep Research</span>
          <span style="font-weight:600;opacity:0.55;">Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
      `,
    })

    await browser.close()

    const pdfBuffer = Buffer.from(pdfUint8)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title.slice(0, 50))}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    console.error('[PDF Export Error]', err)
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 })
  }
}

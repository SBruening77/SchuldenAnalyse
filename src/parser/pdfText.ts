/**
 * PDF-Textextraktion mit pdf.js (legacy-Build für ältere iOS-Safari-Versionen).
 * Der Worker wird als eigenes Bundle geladen (Vite `?url`).
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface TextSpan {
  x: number
  /** rechte Kante */
  x2: number
  str: string
}

export interface TextLine {
  page: number
  y: number
  spans: TextSpan[]
  text: string
}

export interface ExtractedPdf {
  pages: number
  lines: TextLine[]
  /** Breite der ersten Seite (zur Spaltenberechnung) */
  pageWidth: number
}

const Y_TOLERANCE = 2.5

/**
 * Gruppiert Textelemente zeilenweise nach Y-Koordinate und sortiert sie nach X.
 * Gibt sowohl den zusammengesetzten Zeilentext als auch die einzelnen Spans zurück,
 * damit der Parser die Spaltenposition (z. B. der Betragsspalte) auswerten kann.
 */
export function groupIntoLines(
  items: Array<{ str: string; transform: number[]; width: number }>,
  page: number,
): TextLine[] {
  const rows: Array<{ y: number; spans: TextSpan[] }> = []
  for (const it of items) {
    const str = it.str
    if (!str || !str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE)
    if (!row) {
      row = { y, spans: [] }
      rows.push(row)
    }
    row.spans.push({ x, x2: x + (it.width || 0), str })
  }
  // PDF-Koordinaten: y wächst nach oben, daher absteigend sortieren
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    r.spans.sort((a, b) => a.x - b.x)
    // Spans zu Text zusammenfügen, Leerzeichen bei sichtbarer Lücke einfügen
    let text = ''
    let lastX2 = -Infinity
    for (const s of r.spans) {
      const gap = s.x - lastX2
      if (text.length > 0 && gap > 1.5 && !text.endsWith(' ') && !s.str.startsWith(' ')) {
        text += ' '
      }
      text += s.str
      lastX2 = s.x2
    }
    return { page, y: r.y, spans: r.spans, text: text.replace(/\s+/g, ' ').trim() }
  })
}

export async function extractPdfText(
  data: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedPdf> {
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
  const doc = await loadingTask.promise
  const lines: TextLine[] = []
  let pageWidth = 0
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      if (p === 1) pageWidth = page.getViewport({ scale: 1 }).width
      const content = await page.getTextContent()
      const items = content.items.filter((i): i is TextItem => 'str' in i)
      lines.push(...groupIntoLines(items, p))
      onProgress?.(p, doc.numPages)
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return { pages: doc.numPages, lines, pageWidth }
}

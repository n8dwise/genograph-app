import type { LayoutOptions, LayoutResult } from '../layout/types'
import { defaultLayoutOptions } from '../layout/types'
import type { Genogram } from '../model/types'

// Minimal string renderer for inspecting layouts (tests, debug page, CLI snapshots).
// The real interactive renderer comes in Phase 3.

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function debugSvg(g: Genogram, res: LayoutResult, options: Partial<LayoutOptions> = {}): string {
  const o = { ...defaultLayoutOptions, ...options }
  const pad = 40
  const { x, y, width, height } = res.bounds
  const out: string[] = []
  const stroke = '#334155'

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - pad} ${y - pad} ${width + 2 * pad} ${height + 2 * pad}" width="${width + 2 * pad}" height="${height + 2 * pad}" font-family="system-ui, sans-serif">`,
    `<rect x="${x - pad}" y="${y - pad}" width="${width + 2 * pad}" height="${height + 2 * pad}" fill="#fff"/>`,
    `<g fill="none" stroke="${stroke}" stroke-width="1.5">`,
  )

  const partnership = new Map(g.partnerships.map(p => [p.id, p]))
  for (const l of res.partnerLines) {
    const p = l.partnershipId ? partnership.get(l.partnershipId) : undefined
    const dash = p && p.type !== 'married' ? ' stroke-dasharray="6 4"' : ''
    out.push(`<path d="M${l.xA} ${l.yTop}V${l.y}H${l.xB}V${l.yTop}"${dash}/>`)
    const mx = (l.xA + l.xB) / 2
    const slashes = p?.status === 'divorced' ? [-4, 4] : p?.status === 'separated' ? [0] : []
    for (const dx of slashes) out.push(`<path d="M${mx + dx - 4} ${l.y + 7}L${mx + dx + 4} ${l.y - 7}"/>`)
  }

  for (const f of res.families) {
    const dash = f.implied ? ' stroke-dasharray="2 3"' : ''
    if (f.parentStub) out.push(`<path d="M${f.parentStub.x} ${f.parentStub.yTop}V${f.anchorY}H${f.anchorX}"/>`)
    out.push(`<path d="M${f.anchorX} ${f.anchorY}V${f.barY}"${dash}/>`)
    out.push(`<path d="M${f.barX1} ${f.barY}H${f.barX2}"/>`)
    for (const d of f.drops) {
      const dropDash = d.kind === 'adopted' ? ' stroke-dasharray="6 4"' : d.kind === 'foster' ? ' stroke-dasharray="2 3"' : ''
      const color = d.secondary ? ' stroke="#94a3b8"' : ''
      out.push(`<path d="M${d.fromX} ${f.barY}L${d.x} ${d.y}"${dropDash}${color}/>`)
    }
  }
  out.push('</g>')

  // Bonds and emotional relationships: simple straight lines between centers.
  out.push('<g fill="none" stroke-width="1.5">')
  for (const b of g.bonds) {
    const a = res.boxes.get(b.personId)
    const s = res.boxes.get(b.supportId)
    if (a && s) out.push(`<path d="M${a.cx} ${a.cy}L${s.cx} ${s.cy}" stroke="#7c3aed" stroke-dasharray="8 3 2 3" opacity="0.6"/>`)
  }
  for (const r of g.relationships) {
    const a = res.boxes.get(r.a)
    const b = res.boxes.get(r.b)
    if (a && b) out.push(`<path d="M${a.cx} ${a.cy}L${b.cx} ${b.cy}" stroke="#dc2626" opacity="0.35"/>`)
  }
  out.push('</g>')

  for (const p of g.persons) {
    const b = res.boxes.get(p.id)
    if (!b) continue
    const s = o.symbolSize
    const fill = b.support ? '#f5f3ff' : '#fff'
    const shape =
      p.sex === 'F'
        ? `<circle cx="${b.cx}" cy="${b.cy}" r="${s / 2}"`
        : p.sex === 'X'
          ? `<path d="M${b.cx} ${b.y}L${b.x + s} ${b.cy}L${b.cx} ${b.y + s}L${b.x} ${b.cy}Z"`
          : `<rect x="${b.x}" y="${b.y}" width="${s}" height="${s}"`
    out.push(`${shape} fill="${fill}" stroke="${stroke}" stroke-width="2"/>`)
    if (p.sex === '?') out.push(`<text x="${b.cx}" y="${b.cy + 6}" text-anchor="middle" font-size="18" fill="${stroke}">?</text>`)
    if (p.isIndexPerson) {
      const m = 4
      out.push(
        p.sex === 'F'
          ? `<circle cx="${b.cx}" cy="${b.cy}" r="${s / 2 + m}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`
          : `<rect x="${b.x - m}" y="${b.y - m}" width="${s + 2 * m}" height="${s + 2 * m}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`,
      )
    }
    if (p.deceased) {
      out.push(`<path d="M${b.x + 6} ${b.y + 6}L${b.x + s - 6} ${b.y + s - 6}M${b.x + s - 6} ${b.y + 6}L${b.x + 6} ${b.y + s - 6}" stroke="${stroke}" stroke-width="1.5"/>`)
    }
    const age = p.age ?? (p.birthYear !== undefined ? (p.deathYear ?? 2026) - p.birthYear : undefined)
    if (age !== undefined && !p.deceased) {
      out.push(`<text x="${b.cx}" y="${b.cy + 5}" text-anchor="middle" font-size="13" fill="${stroke}">${age}</text>`)
    }
    out.push(`<text x="${b.cx}" y="${b.labelY + 12}" text-anchor="middle" font-size="12" fill="#0f172a">${esc(truncate(p.name, 16))}</text>`)
    if (p.birthYear !== undefined) {
      const years = `${p.birthYear}–${p.deathYear ?? ''}`
      out.push(`<text x="${b.cx}" y="${b.labelY + 26}" text-anchor="middle" font-size="10" fill="#64748b">${years}</text>`)
    }
  }

  out.push('</svg>')
  return out.join('\n')
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

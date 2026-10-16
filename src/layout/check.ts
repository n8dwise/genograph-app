import type { Genogram } from '../model/types'
import { buildLayoutGraph } from './graph'
import type { LayoutOptions, LayoutResult } from './types'
import { defaultLayoutOptions } from './types'

export interface LayoutReport {
  violations: string[]
  /** Mean |family anchor − children's midpoint| in px (lower = better centered). */
  meanCentering: number
  /** Parent→child spine/drops that cross each other between adjacent rows. */
  crossings: number
}

/** Check a layout against the genogram drawing rules. Used by tests and the debug view. */
export function checkLayout(g: Genogram, res: LayoutResult, options: Partial<LayoutOptions> = {}): LayoutReport {
  const o = { ...defaultLayoutOptions, ...options }
  const lg = buildLayoutGraph(g)
  const rel = lg.rel
  const v: string[] = []
  const box = (id: string) => res.boxes.get(id)
  const name = (id: string) => rel.person.get(id)?.name ?? id

  for (const p of g.persons) if (!box(p.id)) v.push(`${name(p.id)} has no position.`)

  // Slots on the same row must not overlap.
  const rows = new Map<number, { id: string; cx: number }[]>()
  for (const b of res.boxes.values()) {
    const k = Math.round(b.y)
    if (!rows.has(k)) rows.set(k, [])
    rows.get(k)!.push({ id: b.id, cx: b.cx })
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.cx - b.cx)
    for (let i = 1; i < row.length; i++) {
      if (row[i].cx - row[i - 1].cx < o.slotWidth - 0.5) {
        v.push(`${name(row[i - 1].id)} and ${name(row[i].id)} overlap.`)
      }
    }
  }

  for (const p of g.partnerships) {
    const a = box(p.a)
    const b = box(p.b)
    if (a && b && a.y !== b.y) v.push(`Partners ${name(p.a)} and ${name(p.b)} are on different rows.`)
  }

  for (const f of g.families) {
    const primary = f.children.filter(c => rel.primaryFamily.get(c.id) === f && box(c.id))
    for (const p of f.parents) {
      for (const c of primary) {
        if (box(p) && box(p)!.y >= box(c.id)!.y) v.push(`${name(p)} is not above child ${name(c.id)}.`)
      }
    }
    const ys = new Set(primary.map(c => box(c.id)!.y))
    if (ys.size > 1) v.push(`Siblings in family ${f.id} are on different rows.`)
    // Birth order applies within the sibling group. Someone who married into
    // another sibling group sits with their partner and is exempt.
    const inGroup = primary.filter(c => lg.unitOf.get(c.id)?.home === f)
    for (let i = 1; i < inGroup.length; i++) {
      if (box(inGroup[i].id)!.cx < box(inGroup[i - 1].id)!.cx) {
        v.push(`${name(inGroup[i].id)} is left of older sibling ${name(inGroup[i - 1].id)}.`)
      }
    }
  }

  // Vertical spines must not run through anyone's symbol or label.
  const hits = (x: number, yFrom: number, yTo: number, skip: Set<string>) => {
    for (const b of res.boxes.values()) {
      if (skip.has(b.id)) continue
      const top = b.y
      const bottom = b.labelY + o.labelHeight
      if (Math.abs(b.cx - x) < o.slotWidth / 2 - 0.5 && yTo > top && yFrom < bottom) return b.id
    }
    return undefined
  }
  for (const c of res.families) {
    const hit = hits(c.anchorX, c.anchorY, c.barY, new Set())
    if (hit) v.push(`Spine of family ${c.familyId} runs through ${name(hit)}.`)
  }

  // Sibling bars on the same height must not overlap.
  const bars = [...res.families].sort((a, b) => a.barX1 - b.barX1)
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length && bars[j].barX1 <= bars[i].barX2; j++) {
      if (Math.abs(bars[i].barY - bars[j].barY) < 0.5) {
        v.push(`Sibling bars of ${bars[i].familyId} and ${bars[j].familyId} overlap.`)
      }
    }
  }

  // Quality metrics.
  let centerSum = 0
  let centerCount = 0
  for (const c of res.families) {
    if (c.implied) continue
    const xs = c.drops.filter(d => !d.secondary).map(d => d.x)
    if (!xs.length) continue
    centerSum += Math.abs(c.anchorX - (Math.min(...xs) + Math.max(...xs)) / 2)
    centerCount++
  }

  let crossings = 0
  const segs = res.families.flatMap(c =>
    c.drops.filter(d => !d.secondary).map(d => ({ y: c.barY, top: c.anchorX, bottom: d.x })),
  )
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i]
      const b = segs[j]
      if (Math.abs(a.y - b.y) > rowPitchTolerance(o)) continue
      if (a.top !== b.top && (a.top - b.top) * (a.bottom - b.bottom) < 0) crossings++
    }
  }

  return { violations: v, meanCentering: centerCount ? centerSum / centerCount : 0, crossings }
}

const rowPitchTolerance = (o: LayoutOptions) => o.trackGap * 10

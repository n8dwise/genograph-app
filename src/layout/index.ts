import type { Genogram, Id } from '../model/types'
import { buildFamilyConnectors, buildPartnerLines } from './connectors'
import { memberX } from './geometry'
import { buildLayoutGraph, type LayoutGraph } from './graph'
import { orderRows } from './order'
import { pava, positionRows } from './position'
import { assignRanks } from './ranks'
import { defaultLayoutOptions, type LayoutOptions, type LayoutResult, type PersonBox } from './types'

export * from './types'

/**
 * Lay out a genogram. Pure: no DOM, no framework — data in, geometry out.
 *
 * Pipeline: units (partners grouped) → generation rows → row ordering →
 * x positions → support row → user pins → connector lines.
 */
export function layout(g: Genogram, options: Partial<LayoutOptions> = {}): LayoutResult {
  const o = { ...defaultLayoutOptions, ...options }
  const lg = buildLayoutGraph(g)
  const boxes = new Map<Id, PersonBox>()

  if (lg.units.length) {
    assignRanks(lg)
    const rows = orderRows(lg, o.sweeps)
    positionRows(lg, rows, o)
    for (const u of lg.units) {
      u.members.forEach((id, i) => {
        boxes.set(id, makeBox(id, memberX(u, i, o), u.rank * rowPitch(o), u.rank, false, o))
      })
    }
  }

  placeSupportRow(lg, boxes, o)
  applyPins(g, boxes, o)

  const partnerLines = buildPartnerLines(lg, boxes, o)
  const families = buildFamilyConnectors(lg, boxes, partnerLines, o)
  return { boxes, partnerLines, families, bounds: computeBounds(boxes, families, o) }
}

export function rowPitch(o: LayoutOptions): number {
  return o.symbolSize + o.labelOffset + o.labelHeight + o.rowGap
}

function makeBox(id: Id, cx: number, top: number, rank: number, support: boolean, o: LayoutOptions): PersonBox {
  const s = o.symbolSize
  return { id, x: cx - s / 2, y: top, size: s, cx, cy: top + s / 2, labelY: top + s + o.labelOffset, rank, support }
}

/** Bond-only people sit in a row below the family, near whoever they support. */
function placeSupportRow(lg: LayoutGraph, boxes: Map<Id, PersonBox>, o: LayoutOptions) {
  if (!lg.supportIds.length) return
  const maxRank = Math.max(-1, ...[...boxes.values()].map(b => b.rank))
  const rank = maxRank + 1
  const top = rank * rowPitch(o) + (boxes.size ? o.rowGap : 0)

  const bondX = (id: Id) => {
    const xs = lg.g.bonds
      .filter(b => b.supportId === id || b.personId === id)
      .map(b => boxes.get(b.supportId === id ? b.personId : b.supportId)?.cx)
      .filter((x): x is number => x !== undefined)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
  }
  const ids = [...lg.supportIds].sort((a, b) => bondX(a) - bondX(b))
  const xs = pava(
    ids.map(bondX),
    ids.map(() => 1),
    ids.slice(1).map(() => o.slotWidth + o.unitGap),
  )
  ids.forEach((id, i) => boxes.set(id, makeBox(id, xs[i], top, rank, true, o)))
}

function applyPins(g: Genogram, boxes: Map<Id, PersonBox>, o: LayoutOptions) {
  for (const [id, pin] of Object.entries(g.pins)) {
    const b = boxes.get(id)
    if (b) boxes.set(id, makeBox(id, b.cx + pin.dx, b.y + pin.dy, b.rank, b.support, o))
  }
}

function computeBounds(boxes: Map<Id, PersonBox>, families: LayoutResult['families'], o: LayoutOptions) {
  if (!boxes.size) return { x: 0, y: 0, width: 0, height: 0 }
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes.values()) {
    x1 = Math.min(x1, b.cx - o.slotWidth / 2)
    x2 = Math.max(x2, b.cx + o.slotWidth / 2)
    y1 = Math.min(y1, b.y)
    y2 = Math.max(y2, b.labelY + o.labelHeight)
  }
  for (const f of families) {
    x1 = Math.min(x1, f.barX1)
    x2 = Math.max(x2, f.barX2)
    y1 = Math.min(y1, f.anchorY, f.barY)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

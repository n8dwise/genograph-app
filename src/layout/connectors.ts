import type { Id } from '../model/types'
import { anchorX } from './geometry'
import type { LayoutGraph } from './graph'
import type { ChildDrop, FamilyConnector, LayoutOptions, PartnerLine, PersonBox } from './types'

/** Partner "U" lines, from final (pinned) box positions. */
export function buildPartnerLines(lg: LayoutGraph, boxes: Map<Id, PersonBox>, o: LayoutOptions): PartnerLine[] {
  const lines: PartnerLine[] = []
  const add = (id: string, a: Id, b: Id, partnershipId?: Id) => {
    const u = lg.unitOf.get(a)
    const ba = boxes.get(a)
    const bb = boxes.get(b)
    if (!u || u !== lg.unitOf.get(b) || !ba || !bb) return
    const nest = Math.abs(u.members.indexOf(a) - u.members.indexOf(b)) - 1
    const yTop = Math.max(ba.y, bb.y) + o.symbolSize
    lines.push({ id, partnershipId, a, b, xA: ba.cx, xB: bb.cx, yTop, y: yTop + o.partnerDrop + nest * o.nestStep })
  }

  const paired = new Set<string>()
  const key = (a: Id, b: Id) => [a, b].sort().join('|')
  for (const p of lg.g.partnerships) {
    add(p.id, p.a, p.b, p.id)
    paired.add(key(p.a, p.b))
  }
  for (const f of lg.g.families) {
    if (f.parents.length === 2 && !paired.has(key(f.parents[0], f.parents[1]))) {
      add(`family:${f.id}`, f.parents[0], f.parents[1])
      paired.add(key(f.parents[0], f.parents[1]))
    }
  }
  return lines
}

/** Spine → sibling bar → drops, for every family with children on the chart. */
export function buildFamilyConnectors(
  lg: LayoutGraph,
  boxes: Map<Id, PersonBox>,
  partnerLines: PartnerLine[],
  o: LayoutOptions,
): FamilyConnector[] {
  const lineFor = new Map<string, PartnerLine>()
  for (const l of partnerLines) lineFor.set([l.a, l.b].sort().join('|'), l)
  const xOf = (id: Id) => boxes.get(id)!.cx

  const connectors: FamilyConnector[] = []
  for (const f of lg.g.families) {
    const kids = f.children.filter(c => boxes.has(c.id))
    if (!kids.length) continue

    const primary = kids.filter(c => lg.rel.primaryFamily.get(c.id) === f)
    const rowTop = Math.min(...(primary.length ? primary : kids).map(c => boxes.get(c.id)!.y))
    const barY = rowTop - o.siblingBarOffset

    const twinX = new Map<string, number>()
    for (const c of kids) {
      if (!c.twinGroup || twinX.has(c.twinGroup)) continue
      const group = kids.filter(k => k.twinGroup === c.twinGroup).map(k => xOf(k.id))
      twinX.set(c.twinGroup, (Math.min(...group) + Math.max(...group)) / 2)
    }

    const drops: ChildDrop[] = kids.map(c => {
      const b = boxes.get(c.id)!
      return {
        childId: c.id,
        kind: c.kind,
        x: b.cx,
        y: b.y,
        fromX: c.twinGroup ? twinX.get(c.twinGroup)! : b.cx,
        ...(c.twinGroup && { twinGroup: c.twinGroup }),
        ...(c.identicalTwin && { identicalTwin: true }),
        secondary: lg.rel.primaryFamily.get(c.id) !== f,
      }
    })

    const dropXs = drops.map(d => d.fromX)
    const parentsShown = lg.parentUnit.has(f.id) && f.parents.every(p => boxes.has(p))
    let conn: FamilyConnector

    if (!parentsShown) {
      const ax = (Math.min(...dropXs) + Math.max(...dropXs)) / 2
      conn = { familyId: f.id, anchorX: ax, anchorY: barY - o.impliedStub, implied: true, barY, barX1: 0, barX2: 0, drops }
    } else if (f.parents.length === 2) {
      const line = lineFor.get([...f.parents].sort().join('|'))!
      conn = { familyId: f.id, anchorX: anchorX(lg, f, o, xOf)!, anchorY: line.y, implied: false, barY, barX1: 0, barX2: 0, drops }
    } else {
      const pb = boxes.get(f.parents[0])!
      const yTop = pb.y + o.symbolSize
      conn = {
        familyId: f.id,
        anchorX: anchorX(lg, f, o, xOf)!,
        anchorY: yTop + o.partnerDrop,
        implied: false,
        parentStub: { x: pb.cx, yTop },
        barY,
        barX1: 0,
        barX2: 0,
        drops,
      }
    }
    conn.barX1 = Math.min(conn.anchorX, ...dropXs)
    conn.barX2 = Math.max(conn.anchorX, ...dropXs)
    connectors.push(conn)
  }

  assignBarTracks(connectors, o)
  return connectors
}

/** Lift sibling bars that would overlap another bar on the same row. */
function assignBarTracks(connectors: FamilyConnector[], o: LayoutOptions) {
  const byRow = new Map<number, FamilyConnector[]>()
  for (const c of connectors) {
    const k = Math.round(c.barY)
    if (!byRow.has(k)) byRow.set(k, [])
    byRow.get(k)!.push(c)
  }
  const margin = 4
  for (const row of byRow.values()) {
    row.sort((a, b) => a.barX1 - b.barX1)
    const trackEnds: number[] = []
    for (const c of row) {
      let t = trackEnds.findIndex(end => end + margin < c.barX1)
      if (t === -1) t = trackEnds.length
      trackEnds[t] = c.barX2
      const lift = t * o.trackGap
      c.barY -= lift
      if (c.implied) c.anchorY -= lift
    }
  }
}

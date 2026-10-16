import type { Family, Id } from '../model/types'
import type { LayoutGraph, Unit } from './graph'
import type { LayoutOptions } from './types'

// Horizontal geometry inside a unit, shared by positioning and connectors.

/** Side of a single parent where their children's spine attaches. */
export function singleParentSide(u: Unit, memberIndex: number): 'left' | 'right' {
  return memberIndex === 0 && u.members.length > 1 ? 'left' : 'right'
}

/** Recompute width and padding (room for single-parent spines at the unit ends). */
export function sizeUnit(lg: LayoutGraph, u: Unit, o: LayoutOptions) {
  u.padL = 0
  u.padR = 0
  u.members.forEach((m, i) => {
    const solo = (lg.rel.familiesAsParent.get(m) ?? []).some(f => f.parents.length === 1 && f.children.length)
    if (!solo) return
    if (singleParentSide(u, i) === 'left') u.padL = o.partnerGap
    else if (i === u.members.length - 1) u.padR = o.partnerGap
  })
  const n = u.members.length
  u.width = n * o.slotWidth + (n - 1) * o.partnerGap + u.padL + u.padR
}

export function memberX(u: Unit, i: number, o: LayoutOptions): number {
  return u.x - u.width / 2 + u.padL + o.slotWidth / 2 + i * (o.slotWidth + o.partnerGap)
}

export function personX(lg: LayoutGraph, id: Id, o: LayoutOptions): number {
  const u = lg.unitOf.get(id)!
  return memberX(u, u.members.indexOf(id), o)
}

/**
 * Where a family's spine leaves the parents' unit.
 * - adjacent partners: midway between them
 * - non-adjacent (multi-partner): in the gap beside the outer partner, toward the hub,
 *   so each partnership gets its own spine
 * - single parent: just outside the parent's slot
 */
export function anchorX(lg: LayoutGraph, f: Family, o: LayoutOptions, xOf = (id: Id) => personX(lg, id, o)): number | undefined {
  const u = lg.parentUnit.get(f.id)
  if (!u) return undefined
  const idx = f.parents.map(p => u.members.indexOf(p)).sort((a, b) => a - b)
  const at = (i: number) => xOf(u.members[i])
  if (idx.length === 2) {
    const [i, j] = idx
    if (j - i === 1) return (at(i) + at(j)) / 2
    return u.hub === i ? (at(j - 1) + at(j)) / 2 : (at(i) + at(i + 1)) / 2
  }
  const [i] = idx
  const offset = o.slotWidth / 2 + o.partnerGap / 2
  return singleParentSide(u, i) === 'left' ? at(i) - offset : at(i) + offset
}

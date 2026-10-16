import { buildRelations, type Relations } from '../model/relations'
import type { Family, Genogram, Id, PartnershipStatus } from '../model/types'

/**
 * A unit is one horizontal group of partners drawn side by side:
 * a single person, a couple, or a person with several partners
 * (`[former…, hub, current…]`). Units are what the layout orders and places.
 */
export interface Unit {
  idx: number
  members: Id[]
  /** Index of the hub member for multi-partner units. */
  hub?: number
  /** Member order may be mirrored to reduce crossings. */
  flippable: boolean
  rank: number
  /** Family whose sibling group this unit sits in (its main blood member's family). */
  home?: Family
  /** Center x, set by positioning. */
  x: number
  width: number
  padL: number
  padR: number
}

export interface LayoutGraph {
  g: Genogram
  rel: Relations
  units: Unit[]
  unitOf: Map<Id, Unit>
  /** Unit holding a family's parents (undefined for implied parents). */
  parentUnit: Map<Id, Unit>
  /** People connected to the family only through bonds; drawn in a support row. */
  supportIds: Id[]
}

export function buildLayoutGraph(g: Genogram): LayoutGraph {
  const rel = buildRelations(g)

  // Who takes part in family structure at all.
  const structural = new Set<Id>()
  for (const p of g.partnerships) structural.add(p.a).add(p.b)
  for (const f of g.families) {
    f.parents.forEach(id => structural.add(id))
    f.children.forEach(c => structural.add(c.id))
  }
  const bonded = new Set(g.bonds.flatMap(b => [b.personId, b.supportId]))
  const supportIds = g.persons
    .filter(p => !structural.has(p.id) && bonded.has(p.id) && !p.isIndexPerson)
    .map(p => p.id)
  const support = new Set(supportIds)

  // Partner adjacency (partnership records + co-parents without one).
  const adj = new Map<Id, Map<Id, PartnershipStatus>>()
  const link = (a: Id, b: Id, status: PartnershipStatus) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Map())
    if (!adj.has(b)) adj.set(b, new Map())
    adj.get(a)!.set(b, status)
    adj.get(b)!.set(a, status)
  }
  for (const p of g.partnerships) link(p.a, p.b, p.status)
  for (const f of g.families) {
    if (f.parents.length === 2 && !adj.get(f.parents[0])?.has(f.parents[1])) {
      link(f.parents[0], f.parents[1], 'active')
    }
  }

  // Connected components of the partner graph become units.
  const units: Unit[] = []
  const unitOf = new Map<Id, Unit>()
  for (const p of g.persons) {
    if (unitOf.has(p.id) || support.has(p.id)) continue
    const component = collect(p.id, adj)
    const unit: Unit = {
      idx: units.length,
      ...orderMembers(component, adj),
      rank: 0,
      x: 0,
      width: 0,
      padL: 0,
      padR: 0,
    }
    units.push(unit)
    for (const id of component) unitOf.set(id, unit)
  }

  const parentUnit = new Map<Id, Unit>()
  for (const f of g.families) {
    const u = f.parents.length ? unitOf.get(f.parents[0]) : undefined
    if (u) parentUnit.set(f.id, u)
  }

  // Home family: the sibling group a unit is drawn in. Prefer the member
  // with the larger sibling group so in-laws don't split a big sibship.
  for (const u of units) {
    let best: Family | undefined
    for (const m of u.members) {
      const f = rel.primaryFamily.get(m)
      if (f && (!best || f.children.length > best.children.length)) best = f
    }
    u.home = best
  }

  return { g, rel, units, unitOf, parentUnit, supportIds }
}

function collect(start: Id, adj: Map<Id, Map<Id, unknown>>): Id[] {
  const seen = new Set([start])
  const queue = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const n of adj.get(queue[i])?.keys() ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return queue
}

/**
 * Left→right member order.
 * - couple: as given (flippable)
 * - star (one person with several partners): former partners left of the hub, current right
 * - chain (A–B–C): walk from one end (flippable)
 * - anything else: breadth-first from the most-partnered person
 */
function orderMembers(
  ids: Id[],
  adj: Map<Id, Map<Id, PartnershipStatus>>,
): { members: Id[]; hub?: number; flippable: boolean } {
  if (ids.length <= 2) return { members: ids, flippable: true }

  const degree = (id: Id) => adj.get(id)?.size ?? 0
  const hub = ids.reduce((a, b) => (degree(b) > degree(a) ? b : a))

  if (degree(hub) === ids.length - 1 && ids.every(id => id === hub || degree(id) === 1)) {
    const partners = [...adj.get(hub)!.entries()]
    const former = partners.filter(([, s]) => s !== 'active').map(([id]) => id)
    const current = partners.filter(([, s]) => s === 'active').map(([id]) => id)
    return { members: [...former, hub, ...current], hub: former.length, flippable: false }
  }

  const edges = ids.reduce((n, id) => n + degree(id), 0) / 2
  if (edges === ids.length - 1 && ids.every(id => degree(id) <= 2)) {
    const end = ids.find(id => degree(id) === 1)!
    return { members: collect(end, adj), flippable: true }
  }

  return { members: collect(hub, adj), hub: 0, flippable: false }
}

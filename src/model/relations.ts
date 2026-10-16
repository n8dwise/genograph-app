import type { ChildKind, Family, Genogram, Id, Partnership, Person } from './types'

/**
 * Read-only lookup tables over a genogram, plus derived relations.
 * Build once per data change; everything is O(1)/O(degree) afterwards.
 */
export interface Relations {
  person: Map<Id, Person>
  partnershipsOf: Map<Id, Partnership[]>
  /** Families in which the person is a parent. */
  familiesAsParent: Map<Id, Family[]>
  /** Families in which the person is a child (bio, adopted, …). */
  familiesAsChild: Map<Id, Family[]>
  /** The family a child is drawn under. See `primaryFamilyOf`. */
  primaryFamily: Map<Id, Family>
}

// Where a child is drawn when they belong to several families
// (e.g. bio parents and adoptive parents both on the chart).
const KIND_PRIORITY: Record<ChildKind, number> = { adopted: 0, bio: 1, foster: 2, step: 3 }

export function buildRelations(g: Genogram): Relations {
  const person = new Map(g.persons.map(p => [p.id, p]))
  const partnershipsOf = new Map<Id, Partnership[]>()
  const familiesAsParent = new Map<Id, Family[]>()
  const familiesAsChild = new Map<Id, Family[]>()
  const primaryFamily = new Map<Id, Family>()
  const primaryKind = new Map<Id, ChildKind>()

  const push = <T>(m: Map<Id, T[]>, k: Id, v: T) => {
    const list = m.get(k)
    if (list) list.push(v)
    else m.set(k, [v])
  }

  for (const p of g.partnerships) {
    push(partnershipsOf, p.a, p)
    push(partnershipsOf, p.b, p)
  }
  for (const f of g.families) {
    for (const pid of f.parents) push(familiesAsParent, pid, f)
    for (const c of f.children) {
      push(familiesAsChild, c.id, f)
      const prev = primaryKind.get(c.id)
      if (prev === undefined || KIND_PRIORITY[c.kind] < KIND_PRIORITY[prev]) {
        primaryKind.set(c.id, c.kind)
        primaryFamily.set(c.id, f)
      }
    }
  }

  return { person, partnershipsOf, familiesAsParent, familiesAsChild, primaryFamily }
}

export function partnersOf(r: Relations, id: Id): Id[] {
  return (r.partnershipsOf.get(id) ?? []).map(p => (p.a === id ? p.b : p.a))
}

export function parentsOf(r: Relations, id: Id): Id[] {
  return unique((r.familiesAsChild.get(id) ?? []).flatMap(f => f.parents))
}

export function childrenOf(r: Relations, id: Id): Id[] {
  return unique((r.familiesAsParent.get(id) ?? []).flatMap(f => f.children.map(c => c.id)))
}

/**
 * Full siblings: share a family (same parent set, including implied parents).
 * Half siblings: share exactly one known parent through different families.
 */
export function siblingsOf(r: Relations, id: Id): { full: Id[]; half: Id[] } {
  const full = new Set<Id>()
  for (const f of r.familiesAsChild.get(id) ?? []) {
    for (const c of f.children) if (c.id !== id) full.add(c.id)
  }
  const half = new Set<Id>()
  for (const parent of parentsOf(r, id)) {
    for (const sib of childrenOf(r, parent)) {
      if (sib !== id && !full.has(sib)) half.add(sib)
    }
  }
  return { full: [...full], half: [...half] }
}

/** Siblings (full or half) of the person's parents. */
export function auntsAndUnclesOf(r: Relations, id: Id): Id[] {
  return unique(
    parentsOf(r, id).flatMap(p => {
      const s = siblingsOf(r, p)
      return [...s.full, ...s.half]
    }),
  )
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

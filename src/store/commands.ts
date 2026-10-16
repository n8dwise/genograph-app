import { nextId } from '../model/ids'
import type {
  Bond, BondType, ChildKind, ChildLink, Family, Genogram, Id, Partnership, PartnershipStatus,
  PartnershipType, Person, Relationship, RelationshipKind,
} from '../model/types'

// Every edit the UI can make, as a pure function: (genogram, args) → new genogram.
// Inputs are never mutated. Each command keeps the model's invariants:
// children stay in birth order, deletes clean up every reference, and the
// primary subject can't be removed.

export class CommandError extends Error {}

export type NewPerson = Omit<Person, 'id' | 'isIndexPerson'>

export interface Result {
  g: Genogram
  /** Id of the record the command created, when it created one. */
  id?: Id
}

/** Clone, apply, stamp `updated`. */
function edit(g: Genogram, fn: (draft: Genogram) => Id | void, now = new Date()): Result {
  const draft = structuredClone(g)
  const id = fn(draft) ?? undefined
  draft.meta.updated = now.toISOString()
  return { g: draft, id }
}

// ── lookups ──────────────────────────────────────────────────────────────────

function person(g: Genogram, id: Id): Person {
  const p = g.persons.find(x => x.id === id)
  if (!p) throw new CommandError(`Person "${id}" not found.`)
  return p
}

/** The family a person is drawn under (adopted > bio > foster > step), as in relations.ts. */
function primaryFamilyOf(g: Genogram, child: Id): Family | undefined {
  const rank: Record<ChildKind, number> = { adopted: 0, bio: 1, foster: 2, step: 3 }
  let best: Family | undefined
  let bestRank = Infinity
  for (const f of g.families) {
    const link = f.children.find(c => c.id === child)
    if (link && rank[link.kind] < bestRank) {
      best = f
      bestRank = rank[link.kind]
    }
  }
  return best
}

const sameSet = (a: Id[], b: Id[]) => a.length === b.length && a.every(x => b.includes(x))

function partnershipBetween(g: Genogram, a: Id, b: Id): Partnership | undefined {
  return g.partnerships.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a))
}

function insertPerson(g: Genogram, p: NewPerson): Id {
  const id = nextId(g.persons.map(x => x.id), 'p')
  g.persons.push({ ...p, id })
  return id
}

// ── birth order ──────────────────────────────────────────────────────────────

/** Comparable birth key (earlier = older); undefined when unknown. */
function birthKey(p: Person | undefined, year = new Date().getFullYear()): number | undefined {
  if (!p) return undefined
  if (p.birthYear !== undefined) return p.birthYear
  if (p.age !== undefined) return year - p.age
  return undefined
}

/**
 * Insert a child keeping oldest-first order. Children with unknown birth keep
 * their place; a newcomer with unknown birth goes last.
 */
function insertChild(g: Genogram, f: Family, link: ChildLink) {
  f.children = f.children.filter(c => c.id !== link.id)
  const key = birthKey(g.persons.find(p => p.id === link.id))
  if (key !== undefined) {
    const at = f.children.findIndex(c => {
      const k = birthKey(g.persons.find(p => p.id === c.id))
      return k !== undefined && k > key
    })
    if (at !== -1) {
      f.children.splice(at, 0, link)
      return
    }
  }
  f.children.push(link)
}

function resortChild(g: Genogram, childId: Id) {
  for (const f of g.families) {
    const link = f.children.find(c => c.id === childId)
    if (link) insertChild(g, f, link)
  }
}

// ── meta ─────────────────────────────────────────────────────────────────────

export function setTitle(g: Genogram, title: string): Result {
  return edit(g, d => void (d.meta.title = title))
}

// ── people ───────────────────────────────────────────────────────────────────

/** Add someone with no connections yet (e.g. the primary subject on a new diagram). */
export function addPerson(g: Genogram, p: NewPerson & { isIndexPerson?: boolean }): Result {
  return edit(g, d => {
    if (p.isIndexPerson) d.persons.forEach(x => delete x.isIndexPerson)
    const id = insertPerson(d, p)
    if (p.isIndexPerson) person(d, id).isIndexPerson = true
    return id
  })
}

export function updatePerson(g: Genogram, id: Id, patch: Partial<NewPerson>): Result {
  return edit(g, d => {
    const p = person(d, id)
    Object.assign(p, patch)
    for (const k of Object.keys(patch) as (keyof NewPerson)[]) {
      if (patch[k] === undefined) delete p[k]
    }
    if ('birthYear' in patch || 'age' in patch) resortChild(d, id)
  })
}

export function setIndexPerson(g: Genogram, id: Id): Result {
  return edit(g, d => {
    person(d, id)
    d.persons.forEach(p => (p.id === id ? (p.isIndexPerson = true) : delete p.isIndexPerson))
  })
}

/** Remove a person and every reference to them. The primary subject can't be deleted. */
export function deletePerson(g: Genogram, id: Id): Result {
  return edit(g, d => {
    if (person(d, id).isIndexPerson) throw new CommandError('The primary subject can’t be deleted.')
    d.persons = d.persons.filter(p => p.id !== id)

    const dropped = new Set(d.partnerships.filter(p => p.a === id || p.b === id).map(p => p.id))
    d.partnerships = d.partnerships.filter(p => !dropped.has(p.id))

    for (const f of d.families) {
      f.parents = f.parents.filter(p => p !== id)
      f.children = f.children.filter(c => c.id !== id)
      if (f.partnershipId && dropped.has(f.partnershipId)) delete f.partnershipId
    }
    pruneFamilies(d)

    d.relationships = d.relationships.filter(r => r.a !== id && r.b !== id)
    d.bonds = d.bonds.filter(b => b.personId !== id && b.supportId !== id)
    for (const h of d.households) h.members = h.members.filter(m => m !== id)
    d.households = d.households.filter(h => h.members.length > 0)
    delete d.pins[id]
  })
}

/** Drop families that no longer express anything (no children, or a lone child with no parents). */
function pruneFamilies(d: Genogram) {
  d.families = d.families.filter(f => f.children.length > 0 && !(f.parents.length === 0 && f.children.length === 1))
}

// ── structural "add relative" actions ────────────────────────────────────────

export interface ParentOptions {
  /** Non-bio parent (adoptive, foster, step): always gets a separate family. */
  kind?: ChildKind
}

/**
 * Add one parent. Joins the child's family if it has room (fewer than two
 * parents), otherwise creates a new family for this child (e.g. adoptive parent).
 */
export function addParent(g: Genogram, childId: Id, p: NewPerson, opts: ParentOptions = {}): Result {
  return edit(g, d => {
    person(d, childId)
    const parentId = insertPerson(d, p)
    const fam = primaryFamilyOf(d, childId)
    if (fam && fam.parents.length < 2 && !opts.kind) {
      fam.parents.push(parentId)
      if (fam.parents.length === 2) linkPartnership(d, fam)
    } else {
      const f = newFamily(d, [parentId])
      insertChild(d, f, { id: childId, kind: opts.kind ?? 'bio' })
    }
    return parentId
  })
}

/** Add both parents at once as a married couple (the common case). Returns the father's id. */
export function addParents(g: Genogram, childId: Id, father: NewPerson, mother: NewPerson): Result {
  return edit(g, d => {
    person(d, childId)
    if (primaryFamilyOf(d, childId)?.parents.length) {
      throw new CommandError('This person already has a parent on the chart; add the other one instead.')
    }
    const a = insertPerson(d, father)
    const b = insertPerson(d, mother)
    const u = newPartnership(d, a, b, 'married', 'active')
    // Siblings with implied parents get these parents too.
    const existing = primaryFamilyOf(d, childId)
    if (existing) {
      existing.parents = [a, b]
      existing.partnershipId = u.id
    } else {
      const f = newFamily(d, [a, b], u.id)
      insertChild(d, f, { id: childId, kind: 'bio' })
    }
    return a
  })
}

export interface PartnerOptions {
  type?: PartnershipType
  status?: PartnershipStatus
}

export function addPartner(g: Genogram, personId: Id, p: NewPerson, opts: PartnerOptions = {}): Result {
  return edit(g, d => {
    person(d, personId)
    const partnerId = insertPerson(d, p)
    newPartnership(d, personId, partnerId, opts.type ?? 'married', opts.status ?? 'active')
    return partnerId
  })
}

export interface ChildOptions {
  /** Other parent (must be on the chart). Omit for a single-parent family. */
  coParentId?: Id
  kind?: ChildKind
}

export function addChild(g: Genogram, parentId: Id, p: NewPerson, opts: ChildOptions = {}): Result {
  return edit(g, d => {
    person(d, parentId)
    if (opts.coParentId) person(d, opts.coParentId)
    const parents = opts.coParentId ? [parentId, opts.coParentId] : [parentId]
    let f = d.families.find(x => sameSet(x.parents, parents))
    if (!f) {
      f = newFamily(d, parents)
      if (parents.length === 2) linkPartnership(d, f)
    }
    const childId = insertPerson(d, p)
    insertChild(d, f, { id: childId, kind: opts.kind ?? 'bio' })
    return childId
  })
}

/** Add a full sibling. With no parents on the chart, the two share a family with implied parents. */
export function addSibling(g: Genogram, personId: Id, p: NewPerson): Result {
  return edit(g, d => {
    person(d, personId)
    let f = primaryFamilyOf(d, personId)
    if (!f) {
      f = newFamily(d, [])
      insertChild(d, f, { id: personId, kind: 'bio' })
    }
    const sibId = insertPerson(d, p)
    insertChild(d, f, { id: sibId, kind: 'bio' })
    return sibId
  })
}

function newFamily(d: Genogram, parents: Id[], partnershipId?: Id): Family {
  const f: Family = { id: nextId(d.families.map(x => x.id), 'f'), parents, children: [] }
  if (partnershipId) f.partnershipId = partnershipId
  d.families.push(f)
  return f
}

function newPartnership(d: Genogram, a: Id, b: Id, type: PartnershipType, status: PartnershipStatus): Partnership {
  const p: Partnership = { id: nextId(d.partnerships.map(x => x.id), 'u'), a, b, type, status }
  d.partnerships.push(p)
  return p
}

/** Point a two-parent family at the parents' partnership, if they have one. */
function linkPartnership(d: Genogram, f: Family) {
  const u = partnershipBetween(d, f.parents[0], f.parents[1])
  if (u) f.partnershipId = u.id
}

// ── partnerships ─────────────────────────────────────────────────────────────

export function addPartnership(g: Genogram, a: Id, b: Id, opts: PartnerOptions = {}): Result {
  return edit(g, d => {
    person(d, a)
    person(d, b)
    if (a === b) throw new CommandError('A person can’t partner with themselves.')
    if (partnershipBetween(d, a, b)) throw new CommandError('These two are already partners.')
    const u = newPartnership(d, a, b, opts.type ?? 'married', opts.status ?? 'active')
    for (const f of d.families) if (f.parents.length === 2 && sameSet(f.parents, [a, b])) f.partnershipId = u.id
    return u.id
  })
}

export function updatePartnership(g: Genogram, id: Id, patch: Partial<Omit<Partnership, 'id' | 'a' | 'b'>>): Result {
  return edit(g, d => {
    const u = d.partnerships.find(p => p.id === id)
    if (!u) throw new CommandError(`Partnership "${id}" not found.`)
    Object.assign(u, patch)
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete u[k]
  })
}

/** Remove the couple relationship. Shared children keep both parents. */
export function deletePartnership(g: Genogram, id: Id): Result {
  return edit(g, d => {
    d.partnerships = d.partnerships.filter(p => p.id !== id)
    for (const f of d.families) if (f.partnershipId === id) delete f.partnershipId
  })
}

// ── children within a family ─────────────────────────────────────────────────

export function updateChildLink(
  g: Genogram,
  familyId: Id,
  childId: Id,
  patch: Partial<Omit<ChildLink, 'id'>>,
): Result {
  return edit(g, d => {
    const link = d.families.find(f => f.id === familyId)?.children.find(c => c.id === childId)
    if (!link) throw new CommandError(`"${childId}" is not a child in family "${familyId}".`)
    Object.assign(link, patch)
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete link[k]
  })
}

/** Mark children of one family as twins (identical optional). */
export function setTwins(g: Genogram, familyId: Id, childIds: Id[], identical = false): Result {
  return edit(g, d => {
    const f = d.families.find(x => x.id === familyId)
    if (!f || childIds.length < 2) throw new CommandError('Pick at least two children of the same family.')
    const group = nextId(
      f.children.flatMap(c => (c.twinGroup ? [c.twinGroup] : [])),
      `${f.id}-t`,
    )
    for (const c of f.children) {
      if (!childIds.includes(c.id)) continue
      c.twinGroup = group
      if (identical) c.identicalTwin = true
      else delete c.identicalTwin
    }
  })
}

// ── relationships & bonds ────────────────────────────────────────────────────

export function addRelationship(g: Genogram, a: Id, b: Id, kind: RelationshipKind, note?: string): Result {
  return edit(g, d => {
    person(d, a)
    person(d, b)
    const r: Relationship = { id: nextId(d.relationships.map(x => x.id), 'r'), a, b, kind }
    if (note) r.note = note
    d.relationships.push(r)
    return r.id
  })
}

export function updateRelationship(g: Genogram, id: Id, patch: Partial<Pick<Relationship, 'kind' | 'note'>>): Result {
  return edit(g, d => {
    const r = d.relationships.find(x => x.id === id)
    if (!r) throw new CommandError(`Relationship "${id}" not found.`)
    Object.assign(r, patch)
  })
}

export function deleteRelationship(g: Genogram, id: Id): Result {
  return edit(g, d => void (d.relationships = d.relationships.filter(r => r.id !== id)))
}

/** Add a new support figure (counselor, mentor, …) bonded to someone on the chart. */
export function addSupportPerson(g: Genogram, personId: Id, p: NewPerson, type: BondType, label?: string): Result {
  return edit(g, d => {
    person(d, personId)
    const supportId = insertPerson(d, p)
    const b: Bond = { id: nextId(d.bonds.map(x => x.id), 'b'), personId, supportId, type }
    if (label) b.label = label
    d.bonds.push(b)
    return supportId
  })
}

export function updateBond(g: Genogram, id: Id, patch: Partial<Pick<Bond, 'type' | 'label' | 'quality'>>): Result {
  return edit(g, d => {
    const b = d.bonds.find(x => x.id === id)
    if (!b) throw new CommandError(`Bond "${id}" not found.`)
    Object.assign(b, patch)
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete b[k]
  })
}

export function deleteBond(g: Genogram, id: Id): Result {
  return edit(g, d => void (d.bonds = d.bonds.filter(b => b.id !== id)))
}

// ── manual positioning ───────────────────────────────────────────────────────

/** Nudge a person by (dx, dy) on top of any existing pin. */
export function nudge(g: Genogram, id: Id, dx: number, dy: number): Result {
  return edit(g, d => {
    person(d, id)
    const pin = d.pins[id] ?? { dx: 0, dy: 0 }
    d.pins[id] = { dx: pin.dx + dx, dy: pin.dy + dy }
  })
}

export function resetLayout(g: Genogram): Result {
  return edit(g, d => void (d.pins = {}))
}

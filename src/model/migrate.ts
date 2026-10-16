import { createGenogram } from './factory'
import { nextId } from './ids'
import type {
  BondType, Family, Genogram, Id, PartnershipStatus, PartnershipType, Quality,
  RelationshipKind, Sex,
} from './types'

// Converters from the two legacy formats into v2:
//  - v1 app files (`{ persons, unions, familyRelations, bonds }`, numeric ids)
//  - the original JointJS demo format (flat person list with mother/father)
// Both return warnings for anything that couldn't be carried over exactly.

export interface MigrationResult {
  genogram: Genogram
  warnings: string[]
}

export type DetectedFormat = 'v2' | 'v1' | 'person-list' | 'unknown'

export function detectFormat(json: unknown): DetectedFormat {
  if (Array.isArray(json)) return 'person-list'
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const meta = o.meta as Record<string, unknown> | undefined
    if (meta?.version === 2) return 'v2'
    if (Array.isArray(o.persons) && Array.isArray(o.unions)) return 'v1'
  }
  return 'unknown'
}

const pid = (n: number | string) => `p${n}`

// ── v1 app format ────────────────────────────────────────────────────────────

export interface V1Data {
  meta?: { title?: string }
  persons: {
    id: number; name: string; sex: 'M' | 'F' | 'O' | '?'
    age?: number; deceased?: boolean; isIndexPerson?: boolean; notes?: string
  }[]
  unions: {
    id: string; partners: [number, number]; type?: string; label?: string
    status?: string; quality?: string; children?: number[]
  }[]
  familyRelations?: { id: string; from: number; to: number; type: string; quality?: string }[]
  bonds?: { id: string; from: number; to: number; type: string; label?: string; quality?: string }[]
  positions?: Record<string, unknown>
}

const V1_QUALITY: Record<string, Quality> = { green: 'good', yellow: 'strained', red: 'conflicted' }
const QUALITY_AS_RELATIONSHIP: Record<Quality, RelationshipKind> = {
  good: 'close',
  strained: 'distant',
  conflicted: 'discord',
}
const V1_STATUS: Record<string, PartnershipStatus> = {
  active: 'active', separated: 'separated', divorced: 'divorced', widowed: 'widowed', deceased: 'widowed',
}
const V1_TYPE: Record<string, PartnershipType> = {
  married: 'married', cohabiting: 'cohabiting', affair: 'affair', other: 'other', unknown: 'other',
}

export function migrateV1(v1: V1Data): MigrationResult {
  const g = createGenogram(v1.meta?.title ?? '')
  const warnings: string[] = []

  g.persons = v1.persons.map(p => ({
    id: pid(p.id),
    name: p.name,
    sex: (p.sex === 'O' ? 'X' : p.sex) as Sex,
    ...(p.age !== undefined && { age: p.age }),
    ...(p.deceased && { deceased: true }),
    ...(p.isIndexPerson && { isIndexPerson: true }),
    ...(p.notes && { notes: p.notes }),
  }))

  for (const u of v1.unions) {
    const quality = u.quality ? V1_QUALITY[u.quality] : undefined
    g.partnerships.push({
      id: u.id,
      a: pid(u.partners[0]),
      b: pid(u.partners[1]),
      type: V1_TYPE[u.type ?? 'unknown'] ?? 'other',
      status: V1_STATUS[u.status ?? 'active'] ?? 'active',
      ...(u.label && { label: u.label }),
      ...(quality && { quality }),
    })
    if (u.children?.length) {
      g.families.push({
        id: nextId(g.families.map(f => f.id), 'f'),
        parents: [pid(u.partners[0]), pid(u.partners[1])],
        partnershipId: u.id,
        children: u.children.map(c => ({ id: pid(c), kind: 'bio' })),
      })
    }
  }

  const familyOfChild = (child: Id) => g.families.find(f => f.children.some(c => c.id === child))
  const newFamily = (parents: Id[]): Family => {
    const f: Family = { id: nextId(g.families.map(x => x.id), 'f'), parents, children: [] }
    g.families.push(f)
    return f
  }
  const addChild = (f: Family, child: Id) => {
    if (!f.children.some(c => c.id === child)) f.children.push({ id: child, kind: 'bio' })
  }
  /** Make `a` a sibling of `b`: put `a` into `b`'s family (creating one with implied parents if needed). */
  const makeSiblings = (a: Id, b: Id) => {
    const fa = familyOfChild(a)
    const fb = familyOfChild(b)
    if (fa && fb) return fa === fb
    if (fb) addChild(fb, a)
    else if (fa) addChild(fa, b)
    else {
      const f = newFamily([])
      addChild(f, b)
      addChild(f, a)
    }
    return true
  }

  for (const rel of v1.familyRelations ?? []) {
    const from = pid(rel.from)
    const to = pid(rel.to)
    const quality = rel.quality ? V1_QUALITY[rel.quality] : undefined
    let ok = true

    switch (rel.type) {
      case 'parent':
      case 'child': {
        const [parent, child] = rel.type === 'parent' ? [from, to] : [to, from]
        const existing = familyOfChild(child)
        if (!existing) addChild(newFamily([parent]), child)
        else if (!existing.parents.includes(parent) && existing.parents.length < 2) existing.parents.push(parent)
        else if (!existing.parents.includes(parent)) ok = false
        break
      }
      case 'sibling':
        ok = makeSiblings(from, to)
        break
      case 'half-sibling':
        // Derivable when the two share a parent through families; otherwise not representable.
        ok = sharesParent(g, from, to)
        break
      case 'aunt':
      case 'uncle':
      case 'niece':
      case 'nephew': {
        const [elder, younger] = rel.type === 'aunt' || rel.type === 'uncle' ? [from, to] : [to, from]
        const parent = familyOfChild(younger)?.parents[0]
        ok = parent !== undefined && makeSiblings(elder, parent)
        break
      }
      default:
        ok = false
    }

    if (!ok) warnings.push(`Family relation ${rel.id} (${rel.type}) could not be represented and was dropped.`)
    else if (quality) {
      g.relationships.push({
        id: nextId(g.relationships.map(r => r.id), 'r'),
        a: from,
        b: to,
        kind: QUALITY_AS_RELATIONSHIP[quality],
      })
    }
  }

  for (const b of v1.bonds ?? []) {
    const quality = b.quality ? V1_QUALITY[b.quality] : undefined
    g.bonds.push({
      id: b.id,
      // v1 phrasing: "<from> is <type> of <to>" → from is the support figure.
      supportId: pid(b.from),
      personId: pid(b.to),
      type: b.type as BondType,
      ...(b.label && { label: b.label }),
      ...(quality && { quality }),
    })
  }

  // `children` order is birth order (oldest first) in v2.
  const age = new Map(g.persons.map(p => [p.id, p.age ?? -1]))
  for (const f of g.families) f.children.sort((a, b) => age.get(b.id)! - age.get(a.id)!)

  if (v1.positions && Object.keys(v1.positions).length) {
    warnings.push('Manually dragged positions from v1 were not carried over; the diagram uses auto-layout.')
  }

  return { genogram: g, warnings }
}

function sharesParent(g: Genogram, a: Id, b: Id): boolean {
  const parents = (x: Id) =>
    new Set(g.families.filter(f => f.children.some(c => c.id === x)).flatMap(f => f.parents))
  const pa = parents(a)
  return [...parents(b)].some(p => pa.has(p))
}

// ── JointJS demo person-list format ──────────────────────────────────────────

export interface DemoPerson {
  id: number
  name: string
  sex: 'M' | 'F' | '?'
  mother?: number
  father?: number
  dob?: string
  dod?: string
  multiple?: number
  identical?: number
  adopted?: boolean
}

export function migratePersonList(list: DemoPerson[], title = ''): MigrationResult {
  const g = createGenogram(title)
  const warnings: string[] = []
  const year = (d?: string) => {
    const n = d ? parseInt(d.slice(0, 4), 10) : NaN
    return Number.isFinite(n) ? n : undefined
  }

  g.persons = list.map(p => {
    const birthYear = year(p.dob)
    const deathYear = year(p.dod)
    return {
      id: pid(p.id),
      name: p.name,
      sex: p.sex,
      ...(birthYear !== undefined && { birthYear }),
      ...(deathYear !== undefined && { deathYear }),
      ...(p.dod !== undefined && { deceased: true }),
    }
  })

  const identicalIds = new Set(list.flatMap(p => (p.identical ? [p.id, p.identical] : [])))
  const families = new Map<string, Family>()
  for (const p of list) {
    if (p.mother === undefined && p.father === undefined) continue
    const parents = [p.father, p.mother].filter((x): x is number => x !== undefined).map(pid)
    const key = parents.join('+')
    let fam = families.get(key)
    if (!fam) {
      fam = { id: `f${families.size + 1}`, parents, children: [] }
      if (parents.length === 2) {
        const partnershipId = `u${g.partnerships.length + 1}`
        g.partnerships.push({ id: partnershipId, a: parents[0], b: parents[1], type: 'married', status: 'active' })
        fam.partnershipId = partnershipId
      }
      families.set(key, fam)
    }
    fam.children.push({
      id: pid(p.id),
      kind: p.adopted ? 'adopted' : 'bio',
      ...(p.multiple !== undefined && { twinGroup: `${fam.id}-t${p.multiple}` }),
      ...(identicalIds.has(p.id) && { identicalTwin: true }),
    })
  }
  g.families = [...families.values()]

  // Birth order (oldest first) is the drawing order; keep the source order for ties.
  const birth = new Map(g.persons.map(p => [p.id, p.birthYear ?? Infinity]))
  for (const f of g.families) f.children.sort((a, b) => birth.get(a.id)! - birth.get(b.id)!)

  warnings.push('Partnerships were inferred from shared children; childless couples are not in this format.')
  return { genogram: g, warnings }
}

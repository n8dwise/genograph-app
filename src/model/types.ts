// Genograph v2 data model. See PLAN.md → "Data model v2".
//
// Parentage is expressed in exactly one place: `Family`. Siblings,
// half-siblings, aunts/uncles etc. are derived, never stored.

export type Id = string

export type Sex = 'M' | 'F' | 'X' | '?'

export type Quality = 'good' | 'strained' | 'conflicted'

export interface Person {
  id: Id
  name: string
  sex: Sex
  birthYear?: number
  deathYear?: number
  /** Used when birth year is unknown. */
  age?: number
  deceased?: boolean
  isIndexPerson?: boolean
  notes?: string
}

export type PartnershipType = 'married' | 'cohabiting' | 'dating' | 'affair' | 'other'
export type PartnershipStatus = 'active' | 'separated' | 'divorced' | 'widowed'

export interface Partnership {
  id: Id
  a: Id
  b: Id
  type: PartnershipType
  status: PartnershipStatus
  label?: string
  startYear?: number
  endYear?: number
  quality?: Quality
}

export type ChildKind = 'bio' | 'adopted' | 'foster' | 'step'

export interface ChildLink {
  id: Id
  kind: ChildKind
  /** Children sharing a twinGroup are drawn as twins. */
  twinGroup?: string
  identicalTwin?: boolean
}

export interface Family {
  id: Id
  /** 0–2 parents. Fewer than 2 means the missing parent(s) are implied (off-chart). */
  parents: Id[]
  partnershipId?: Id
  /** Birth order, oldest first. */
  children: ChildLink[]
}

export type RelationshipKind =
  | 'harmony'
  | 'close'
  | 'fused'
  | 'enmeshed'
  | 'distant'
  | 'cutoff'
  | 'discord'
  | 'hostile'
  | 'close-hostile'
  | 'violence'
  | 'physical-abuse'
  | 'emotional-abuse'
  | 'sexual-abuse'
  | 'neglect'
  | 'focused-on'
  | 'distrust'
  | 'love'
  | 'indifferent'

/** Emotional / clinical line between any two people. */
export interface Relationship {
  id: Id
  a: Id
  b: Id
  kind: RelationshipKind
  note?: string
}

export type BondType =
  | 'guardian'
  | 'close-friend'
  | 'counselor'
  | 'mentor'
  | 'caregiver'
  | 'sponsor'
  | 'important-adult'
  | 'other'

/** Non-family support figure connected to someone in the family. */
export interface Bond {
  id: Id
  personId: Id
  supportId: Id
  type: BondType
  label?: string
  quality?: Quality
}

export interface Household {
  id: Id
  members: Id[]
  label?: string
}

/** User nudge applied on top of auto-layout, in layout units. */
export interface Pin {
  dx: number
  dy: number
}

export interface Genogram {
  meta: {
    version: 2
    title: string
    created: string
    updated: string
  }
  persons: Person[]
  partnerships: Partnership[]
  families: Family[]
  relationships: Relationship[]
  bonds: Bond[]
  households: Household[]
  pins: Record<Id, Pin>
}

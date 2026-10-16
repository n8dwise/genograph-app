import { genogramSchema } from './schema'
import type { Genogram, Id } from './types'

export type ValidationResult =
  | { ok: true; genogram: Genogram; warnings: string[] }
  | { ok: false; errors: string[] }

/**
 * Validate untrusted JSON (file import, AI output) as a v2 genogram.
 * Errors are written for a non-programmer: they name the record and the problem.
 */
export function validateGenogram(input: unknown): ValidationResult {
  const parsed = genogramSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`),
    }
  }
  const g = parsed.data
  const errors = checkReferences(g)
  if (errors.length) return { ok: false, errors }
  return { ok: true, genogram: g, warnings: collectWarnings(g) }
}

function checkReferences(g: Genogram): string[] {
  const errors: string[] = []
  const personIds = new Set<Id>()

  const seen = new Set<Id>()
  const unique = (kind: string, id: Id) => {
    if (seen.has(id)) errors.push(`Duplicate id "${id}" (${kind}).`)
    seen.add(id)
  }
  for (const p of g.persons) {
    unique('person', p.id)
    personIds.add(p.id)
  }
  g.partnerships.forEach(x => unique('partnership', x.id))
  g.families.forEach(x => unique('family', x.id))
  g.relationships.forEach(x => unique('relationship', x.id))
  g.bonds.forEach(x => unique('bond', x.id))
  g.households.forEach(x => unique('household', x.id))

  const person = (where: string, id: Id) => {
    if (!personIds.has(id)) errors.push(`${where} refers to unknown person "${id}".`)
  }

  const partnershipIds = new Set(g.partnerships.map(p => p.id))
  for (const p of g.partnerships) {
    person(`Partnership ${p.id}`, p.a)
    person(`Partnership ${p.id}`, p.b)
    if (p.a === p.b) errors.push(`Partnership ${p.id} pairs a person with themselves.`)
  }

  for (const f of g.families) {
    f.parents.forEach(id => person(`Family ${f.id}`, id))
    f.children.forEach(c => person(`Family ${f.id}`, c.id))
    if (new Set(f.parents).size !== f.parents.length) {
      errors.push(`Family ${f.id} lists the same parent twice.`)
    }
    if (f.partnershipId && !partnershipIds.has(f.partnershipId)) {
      errors.push(`Family ${f.id} refers to unknown partnership "${f.partnershipId}".`)
    }
    const childIds = f.children.map(c => c.id)
    if (new Set(childIds).size !== childIds.length) {
      errors.push(`Family ${f.id} lists the same child twice.`)
    }
    for (const c of childIds) {
      if (f.parents.includes(c)) errors.push(`Family ${f.id}: "${c}" is listed as their own parent.`)
    }
  }

  for (const r of g.relationships) {
    person(`Relationship ${r.id}`, r.a)
    person(`Relationship ${r.id}`, r.b)
  }
  for (const b of g.bonds) {
    person(`Bond ${b.id}`, b.personId)
    person(`Bond ${b.id}`, b.supportId)
  }
  for (const h of g.households) h.members.forEach(id => person(`Household ${h.id}`, id))

  return errors
}

function collectWarnings(g: Genogram): string[] {
  const warnings: string[] = []
  const indexCount = g.persons.filter(p => p.isIndexPerson).length
  if (indexCount === 0) warnings.push('No primary subject (index person) is set.')
  if (indexCount > 1) warnings.push(`${indexCount} people are marked as the primary subject; expected one.`)
  return warnings
}

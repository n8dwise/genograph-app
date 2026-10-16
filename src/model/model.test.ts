import { describe, expect, it } from 'vitest'
import { fixtures } from '../fixtures'
import example from '../fixtures/legacy/example.json'
import { createGenogram } from './factory'
import { detectFormat, migrateV1, type V1Data } from './migrate'
import { auntsAndUnclesOf, buildRelations, parentsOf, partnersOf, siblingsOf } from './relations'
import { validateGenogram } from './validate'

describe('validateGenogram', () => {
  it('accepts every migrated fixture', () => {
    for (const [name, load] of Object.entries(fixtures)) {
      const result = validateGenogram(load())
      expect(result.ok, `${name}: ${!result.ok && result.errors.join('; ')}`).toBe(true)
    }
  })

  it('reports schema errors with a path', () => {
    const g = createGenogram() as unknown as Record<string, unknown>
    g.persons = [{ id: 'p1', name: 'A', sex: 'male' }]
    const result = validateGenogram(g)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/^persons\.0\.sex:/)
  })

  it('reports dangling references and duplicates', () => {
    const g = createGenogram()
    g.persons = [
      { id: 'p1', name: 'A', sex: 'M', isIndexPerson: true },
      { id: 'p1', name: 'B', sex: 'F' },
    ]
    g.families = [{ id: 'f1', parents: ['p1', 'p9'], children: [{ id: 'p1', kind: 'bio' }] }]
    const result = validateGenogram(g)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('Duplicate id "p1" (person).')
      expect(result.errors).toContain('Family f1 refers to unknown person "p9".')
      expect(result.errors).toContain('Family f1: "p1" is listed as their own parent.')
    }
  })

  it('fills optional collections with defaults', () => {
    const g = createGenogram()
    g.persons = [{ id: 'p1', name: 'A', sex: 'M', isIndexPerson: true }]
    const { families, bonds, ...rest } = g
    void families
    void bonds
    const result = validateGenogram(rest)
    expect(result.ok && result.genogram.families).toEqual([])
  })

  it('warns when there is no primary subject', () => {
    const result = validateGenogram(fixtures.thompson())
    expect(result.ok && result.warnings).toContain('No primary subject (index person) is set.')
  })
})

describe('detectFormat', () => {
  it('recognises all three formats', () => {
    expect(detectFormat(createGenogram())).toBe('v2')
    expect(detectFormat(example)).toBe('v1')
    expect(detectFormat([{ id: 1 }])).toBe('person-list')
    expect(detectFormat({ foo: 1 })).toBe('unknown')
  })
})

describe('migrateV1 (example.json)', () => {
  const { genogram: g, warnings } = migrateV1(example as V1Data)
  const r = buildRelations(g)

  it('converts people, partnerships and bonds', () => {
    expect(g.persons).toHaveLength(15)
    expect(g.persons.find(p => p.id === 'p15')?.sex).toBe('X')
    expect(g.partnerships.find(p => p.id === 'u2')).toMatchObject({
      a: 'p2', b: 'p3', status: 'divorced', quality: 'conflicted',
    })
    expect(g.bonds[0]).toMatchObject({ supportId: 'p14', personId: 'p1', type: 'counselor' })
  })

  it('orders children oldest first', () => {
    const leoNinaRiver = g.families.find(f => f.partnershipId === 'u4')!
    expect(leoNinaRiver.children.map(c => c.id)).toEqual(['p15', 'p8', 'p9'])
  })

  it('keeps half-sibling relations as derived facts, with quality as a relationship line', () => {
    expect(siblingsOf(r, 'p6').half.sort()).toEqual(['p1', 'p5'])
    expect(g.relationships).toContainEqual(expect.objectContaining({ a: 'p6', b: 'p1', kind: 'distant' }))
    expect(warnings).toEqual([])
  })

  it('derives parents, partners, aunts', () => {
    expect(parentsOf(r, 'p1').sort()).toEqual(['p2', 'p3'])
    expect(partnersOf(r, 'p2').sort()).toEqual(['p3', 'p4'])
    expect(auntsAndUnclesOf(r, 'p1')).toEqual(['p13'])
  })
})

describe('v1 family relations without shared parents', () => {
  const base: V1Data = {
    persons: [
      { id: 1, name: 'Kid', sex: 'M', isIndexPerson: true },
      { id: 2, name: 'Mom', sex: 'F' },
      { id: 3, name: 'Aunt', sex: 'F' },
      { id: 4, name: 'Brother', sex: 'M' },
      { id: 5, name: 'Stranger', sex: 'M' },
    ],
    unions: [],
  }

  it('builds families from parent / sibling / aunt relations', () => {
    const { genogram: g, warnings } = migrateV1({
      ...base,
      familyRelations: [
        { id: 'fr1', from: 2, to: 1, type: 'parent' },
        { id: 'fr2', from: 4, to: 1, type: 'sibling' },
        { id: 'fr3', from: 3, to: 1, type: 'aunt' },
        { id: 'fr4', from: 5, to: 1, type: 'half-sibling' },
      ],
    })
    const r = buildRelations(g)
    expect(parentsOf(r, 'p1')).toEqual(['p2'])
    expect(siblingsOf(r, 'p1').full).toEqual(['p4'])
    expect(auntsAndUnclesOf(r, 'p1')).toEqual(['p3'])
    expect(parentsOf(r, 'p3')).toEqual([]) // implied parents
    expect(warnings).toEqual(['Family relation fr4 (half-sibling) could not be represented and was dropped.'])
  })
})

describe('migratePersonList (thompson.json)', () => {
  const g = fixtures.thompson()

  it('infers partnerships and families from mother/father', () => {
    const r = buildRelations(g)
    expect(parentsOf(r, 'p9').sort()).toEqual(['p1', 'p2'])
    expect(g.families.every(f => f.parents.length !== 2 || f.partnershipId)).toBe(true)
  })

  it('carries twins, identical twins, adoption and years', () => {
    const kids = g.families.flatMap(f => f.children)
    const triplets = kids.filter(c => c.twinGroup && ['p30', 'p31', 'p32'].includes(c.id))
    expect(new Set(triplets.map(c => c.twinGroup)).size).toBe(1)
    expect(kids.filter(c => c.identicalTwin).map(c => c.id).sort()).toEqual(['p30', 'p32'])
    expect(kids.find(c => c.id === 'p33')?.kind).toBe('adopted')
    expect(g.persons.find(p => p.id === 'p1')).toMatchObject({ birthYear: 1910, deathYear: 1982, deceased: true })
  })
})

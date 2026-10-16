import { describe, expect, it } from 'vitest'
import { checkLayout } from '../layout/check'
import { layout } from '../layout'
import { createGenogram } from '../model/factory'
import { buildRelations, parentsOf, partnersOf, siblingsOf } from '../model/relations'
import type { Genogram, Id } from '../model/types'
import { validateGenogram } from '../model/validate'
import * as cmd from './commands'

/** Tiny helper: run a command, return new genogram, remember created id. */
function chain(start: Genogram) {
  let g = start
  return {
    get g() {
      return g
    },
    do(fn: (g: Genogram) => cmd.Result): Id {
      const r = fn(g)
      g = r.g
      return r.id!
    },
  }
}

const M = (name: string, extra = {}) => ({ name, sex: 'M' as const, ...extra })
const F = (name: string, extra = {}) => ({ name, sex: 'F' as const, ...extra })

function withSubject() {
  const c = chain(createGenogram('Test'))
  const alex = c.do(g => cmd.addPerson(g, { ...M('Alex', { age: 38 }), isIndexPerson: true }))
  return { c, alex }
}

describe('commands are pure', () => {
  it('never mutates the input', () => {
    const { c, alex } = withSubject()
    const before = structuredClone(c.g)
    cmd.addPartner(c.g, alex, F('Jordan'))
    cmd.updatePerson(c.g, alex, { name: 'Changed' })
    expect(c.g).toEqual(before)
  })
})

describe('building a family from the primary subject', () => {
  it('produces a valid genogram that lays out cleanly', () => {
    const { c, alex } = withSubject()
    const dad = c.do(g => cmd.addParents(g, alex, M('Richard', { age: 65 }), F('Carol', { age: 62 })))
    const carol = c.g.persons.find(p => p.name === 'Carol')!.id
    c.do(g => cmd.addSibling(g, alex, F('Megan', { age: 41 })))
    const susan = c.do(g => cmd.addPartner(g, dad, F('Susan', { age: 55 })))
    c.do(g => cmd.addChild(g, dad, M('Tyler', { age: 22 }), { coParentId: susan }))
    const jordan = c.do(g => cmd.addPartner(g, alex, F('Jordan', { age: 35 })))
    c.do(g => cmd.addChild(g, alex, M('Leo', { age: 10 }), { coParentId: jordan }))
    c.do(g => cmd.addChild(g, alex, F('Nina', { age: 7 }), { coParentId: jordan }))
    c.do(g => cmd.addSibling(g, dad, F('Lisa', { age: 59 })))
    c.do(g => cmd.addSupportPerson(g, alex, F('Dr. Park'), 'counselor'))
    const u = c.g.partnerships.find(p => [p.a, p.b].includes(carol))!
    c.do(g => cmd.updatePartnership(g, u.id, { status: 'divorced', quality: 'conflicted' }))

    const v = validateGenogram(c.g)
    expect(v.ok && v.warnings).toEqual([])
    expect(checkLayout(c.g, layout(c.g)).violations).toEqual([])

    const r = buildRelations(c.g)
    expect(siblingsOf(r, alex)).toEqual({ full: [c.g.persons.find(p => p.name === 'Megan')!.id], half: [c.g.persons.find(p => p.name === 'Tyler')!.id] })
    expect(partnersOf(r, dad).sort()).toEqual([carol, susan].sort())
    // Lisa had no parents on the chart → sibling of Richard via implied parents.
    expect(parentsOf(r, c.g.persons.find(p => p.name === 'Lisa')!.id)).toEqual([])
  })
})

describe('birth order', () => {
  it('inserts children oldest first and re-sorts when an age changes', () => {
    const { c, alex } = withSubject()
    const kid = (name: string, age?: number) => c.do(g => cmd.addChild(g, alex, M(name, age === undefined ? {} : { age })))
    const b = kid('B', 10)
    const a = kid('A', 12)
    const unknown = kid('U')
    const d = kid('D', 5)
    const order = () => c.g.families[0].children.map(x => x.id)
    expect(order()).toEqual([a, b, unknown, d]) // unknown-age children keep their place

    c.do(g => cmd.updatePerson(g, d, { age: 15 }))
    expect(order()).toEqual([d, a, b, unknown])

    c.do(g => cmd.updatePerson(g, unknown, { birthYear: new Date().getFullYear() - 11 }))
    expect(order()).toEqual([d, a, unknown, b])
  })
})

describe('parents', () => {
  it('joins a one-parent family, but keeps non-bio parents in their own family', () => {
    const { c, alex } = withSubject()
    const mom = c.do(g => cmd.addParent(g, alex, F('Mom')))
    const dad = c.do(g => cmd.addParent(g, alex, M('Dad')))
    expect(c.g.families).toEqual([{ id: 'f1', parents: [mom, dad], children: [{ id: alex, kind: 'bio' }] }])
    const step = c.do(g => cmd.addParent(g, alex, M('Stepdad'), { kind: 'step' }))
    expect(c.g.families[1]).toEqual({ id: 'f2', parents: [step], children: [{ id: alex, kind: 'step' }] })
  })

  it('refuses addParents when a parent already exists', () => {
    const { c, alex } = withSubject()
    c.do(g => cmd.addParent(g, alex, F('Mom')))
    expect(() => cmd.addParents(c.g, alex, M('X'), F('Y'))).toThrow(cmd.CommandError)
  })

  it('gives implied-parent siblings real parents when parents are added', () => {
    const { c, alex } = withSubject()
    const sis = c.do(g => cmd.addSibling(g, alex, F('Sis')))
    c.do(g => cmd.addParents(g, alex, M('Dad'), F('Mom')))
    const r = buildRelations(c.g)
    expect(parentsOf(r, sis)).toEqual(parentsOf(r, alex))
    expect(c.g.families).toHaveLength(1)
  })

  it('links a family to the partnership when partners are joined later', () => {
    const { c, alex } = withSubject()
    const mom = c.do(g => cmd.addParent(g, alex, F('Mom')))
    const dad = c.do(g => cmd.addParent(g, alex, M('Dad')))
    expect(c.g.families[0].parents).toEqual([mom, dad])
    const u = c.do(g => cmd.addPartnership(g, mom, dad, { status: 'divorced' }))
    expect(c.g.families[0].partnershipId).toBe(u)
    expect(() => cmd.addPartnership(c.g, dad, mom)).toThrow('already partners')
  })
})

describe('deletePerson', () => {
  it('cleans up every reference', () => {
    const { c, alex } = withSubject()
    const jordan = c.do(g => cmd.addPartner(g, alex, F('Jordan')))
    const leo = c.do(g => cmd.addChild(g, alex, M('Leo'), { coParentId: jordan }))
    c.do(g => cmd.addRelationship(g, jordan, alex, 'close'))
    c.do(g => cmd.addSupportPerson(g, jordan, F('Coach'), 'mentor'))
    c.do(g => cmd.nudge(g, jordan, 5, 0))

    c.do(g => cmd.deletePerson(g, jordan))
    const g = c.g
    expect(g.persons.map(p => p.name).sort()).toEqual(['Alex', 'Coach', 'Leo'])
    expect(g.partnerships).toEqual([])
    expect(g.families).toEqual([{ id: 'f1', parents: [alex], children: [{ id: leo, kind: 'bio' }] }])
    expect(g.relationships).toEqual([])
    expect(g.bonds).toEqual([])
    expect(g.pins).toEqual({})
    expect(validateGenogram(g).ok).toBe(true)
  })

  it('drops families that become meaningless', () => {
    const { c, alex } = withSubject()
    const sis = c.do(g => cmd.addSibling(g, alex, F('Sis')))
    c.do(g => cmd.deletePerson(g, sis))
    expect(c.g.families).toEqual([]) // lone child with implied parents
  })

  it('protects the primary subject', () => {
    const { c, alex } = withSubject()
    expect(() => cmd.deletePerson(c.g, alex)).toThrow('primary subject')
  })
})

describe('misc', () => {
  it('moves the primary subject marker', () => {
    const { c, alex } = withSubject()
    const sis = c.do(g => cmd.addSibling(g, alex, F('Sis')))
    c.do(g => cmd.setIndexPerson(g, sis))
    expect(c.g.persons.filter(p => p.isIndexPerson).map(p => p.id)).toEqual([sis])
  })

  it('marks twins and identical twins', () => {
    const { c, alex } = withSubject()
    const a = c.do(g => cmd.addChild(g, alex, M('A')))
    const b = c.do(g => cmd.addChild(g, alex, M('B')))
    c.do(g => cmd.setTwins(g, 'f1', [a, b], true))
    expect(c.g.families[0].children).toEqual([
      { id: a, kind: 'bio', twinGroup: 'f1-t1', identicalTwin: true },
      { id: b, kind: 'bio', twinGroup: 'f1-t1', identicalTwin: true },
    ])
  })

  it('removes optional fields when patched to undefined', () => {
    const { c, alex } = withSubject()
    c.do(g => cmd.updatePerson(g, alex, { notes: 'x' }))
    c.do(g => cmd.updatePerson(g, alex, { notes: undefined }))
    expect('notes' in c.g.persons[0]).toBe(false)
  })

  it('accumulates nudges and resets them', () => {
    const { c, alex } = withSubject()
    c.do(g => cmd.nudge(g, alex, 5, 2))
    c.do(g => cmd.nudge(g, alex, -1, 1))
    expect(c.g.pins[alex]).toEqual({ dx: 4, dy: 3 })
    c.do(g => cmd.resetLayout(g))
    expect(c.g.pins).toEqual({})
  })
})

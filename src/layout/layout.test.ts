import { describe, expect, it } from 'vitest'
import { fixtures } from '../fixtures'
import { createGenogram } from '../model/factory'
import type { Genogram } from '../model/types'
import { checkLayout } from './check'
import { layout } from './index'
import { pava } from './position'

describe('pava', () => {
  it('keeps targets that already satisfy the gaps', () => {
    expect(pava([0, 100, 300], [1, 1, 1], [50, 50])).toEqual([0, 100, 300])
  })

  it('pushes apart symmetrically around the weighted mean', () => {
    expect(pava([100, 100], [1, 1], [50])).toEqual([75, 125])
    expect(pava([100, 100], [3, 1], [40])).toEqual([90, 130])
  })
})

describe('layout on v1 sample families', () => {
  for (const [name, load] of Object.entries(fixtures)) {
    if (name === 'benchmark') continue
    it(`${name}: satisfies all drawing rules`, () => {
      const g = load()
      const report = checkLayout(g, layout(g))
      expect(report.violations).toEqual([])
    })
  }

  it('example: places the support figure below and current-marriage kids right of former', () => {
    const g = fixtures.example()
    const res = layout(g)
    const box = (id: string) => res.boxes.get(id)!
    expect(box('p14').support).toBe(true) // Dr. Park
    expect(box('p14').y).toBeGreaterThan(Math.max(...g.persons.filter(p => p.id !== 'p14').map(p => box(p.id).y)))
    // Richard (p2): Carol (former, p3) left, Susan (current, p4) right.
    expect(box('p3').cx).toBeLessThan(box('p2').cx)
    expect(box('p4').cx).toBeGreaterThan(box('p2').cx)
    // Tyler (p6, Susan's son) right of Alex & Megan (Carol's).
    expect(box('p6').cx).toBeGreaterThan(Math.max(box('p1').cx, box('p5').cx))
    // Aunt Lisa (p13) on Richard's row.
    expect(box('p13').y).toBe(box('p2').y)
  })

  it('benchmark (~1000 people) is valid and fast', () => {
    const g = fixtures.benchmark()
    const t0 = performance.now()
    const res = layout(g)
    const ms = performance.now() - t0
    const report = checkLayout(g, res)
    expect(report.violations).toEqual([])
    expect(ms).toBeLessThan(1000) // budget is 200 ms in the browser; generous for CI
  })
})

describe('layout edge cases', () => {
  const person = (id: string, sex: 'M' | 'F' = 'M') => ({ id, name: id, sex })

  it('handles an empty genogram', () => {
    const res = layout(createGenogram())
    expect(res.boxes.size).toBe(0)
  })

  it('lays out a lone primary subject', () => {
    const g = createGenogram()
    g.persons = [{ ...person('p1'), isIndexPerson: true }]
    expect(layout(g).boxes.get('p1')).toMatchObject({ rank: 0 })
  })

  it('draws siblings with implied parents and single-parent families cleanly', () => {
    const g: Genogram = {
      ...createGenogram(),
      persons: ['p1', 'p2', 'p3', 'p4', 'p5'].map(id => person(id)),
      families: [
        { id: 'f1', parents: [], children: [{ id: 'p1', kind: 'bio' }, { id: 'p2', kind: 'bio' }] },
        { id: 'f2', parents: ['p2'], children: [{ id: 'p3', kind: 'bio' }, { id: 'p4', kind: 'adopted' }] },
      ],
    }
    const res = layout(g)
    expect(checkLayout(g, res).violations).toEqual([])
    const f1 = res.families.find(f => f.familyId === 'f1')!
    expect(f1.implied).toBe(true)
    const f2 = res.families.find(f => f.familyId === 'f2')!
    expect(f2.parentStub).toBeDefined()
  })

  it('gives each of three partners their own spine', () => {
    const g: Genogram = {
      ...createGenogram(),
      persons: [person('h'), person('w1', 'F'), person('w2', 'F'), person('w3', 'F'), ...['c1', 'c2', 'c3'].map(id => person(id))],
      partnerships: [
        { id: 'u1', a: 'h', b: 'w1', type: 'married', status: 'divorced' },
        { id: 'u2', a: 'h', b: 'w2', type: 'married', status: 'divorced' },
        { id: 'u3', a: 'h', b: 'w3', type: 'married', status: 'active' },
      ],
      families: [
        { id: 'f1', parents: ['h', 'w1'], partnershipId: 'u1', children: [{ id: 'c1', kind: 'bio' }] },
        { id: 'f2', parents: ['h', 'w2'], partnershipId: 'u2', children: [{ id: 'c2', kind: 'bio' }] },
        { id: 'f3', parents: ['h', 'w3'], partnershipId: 'u3', children: [{ id: 'c3', kind: 'bio' }] },
      ],
    }
    const res = layout(g)
    expect(checkLayout(g, res).violations).toEqual([])
    const anchors = res.families.map(f => f.anchorX)
    expect(new Set(anchors).size).toBe(3)
    const deeper = res.partnerLines.filter(l => l.y > res.partnerLines[0].y || l.y < res.partnerLines[0].y)
    expect(deeper.length).toBeGreaterThan(0) // non-adjacent partner line nests lower
  })

  it('applies pins as offsets on top of auto-layout', () => {
    const g = fixtures.example()
    const before = layout(g).boxes.get('p1')!
    g.pins = { p1: { dx: 10, dy: 5 } }
    const after = layout(g).boxes.get('p1')!
    expect(after.cx - before.cx).toBe(10)
    expect(after.y - before.y).toBe(5)
  })
})

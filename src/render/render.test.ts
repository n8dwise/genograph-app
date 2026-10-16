import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import { fixtures } from '../fixtures'
import { layout } from '../layout'
import type { FamilyConnector, PartnerLine, PersonBox } from '../layout/types'
import Diagram from './Diagram.svelte'
import { ageLabel, curveBetween, identicalTwinBars, statusMarks, yearsLabel } from './paths'
import { fit, toDiagram, zoomAt } from './viewport'

describe('viewport', () => {
  it('fits bounds centered, never zooming in past maxK', () => {
    const v = fit({ x: 0, y: 0, width: 1000, height: 500 }, 600, 400, 50)
    expect(v.k).toBeCloseTo(0.5)
    expect(v.x).toBeCloseTo(50)
    expect(v.y).toBeCloseTo(75)
    expect(fit({ x: 0, y: 0, width: 10, height: 10 }, 600, 400).k).toBe(1.5)
  })

  it('zooms about a fixed screen point', () => {
    const v = { x: 10, y: 20, k: 1 }
    const before = toDiagram(v, 300, 200)
    const z = zoomAt(v, 2, 300, 200)
    expect(z.k).toBe(2)
    expect(toDiagram(z, 300, 200)).toEqual(before)
    expect(zoomAt(v, 1000, 0, 0).k).toBe(4) // clamped
  })
})

const box = (id: string, cx: number, y: number): PersonBox => ({
  id, x: cx - 20, y, size: 40, cx, cy: y + 20, labelY: y + 70, rank: 0, support: false,
})

describe('paths', () => {
  const line: PartnerLine = { id: 'u1', a: 'a', b: 'b', xA: 0, xB: 100, yTop: 40, y: 52 }

  it('marks divorce with two slashes, separation with one', () => {
    expect(statusMarks(line, 'divorced').match(/M/g)).toHaveLength(2)
    expect(statusMarks(line, 'separated').match(/M/g)).toHaveLength(1)
    expect(statusMarks(line, 'active')).toBe('')
  })

  it('arcs same-row relationship lines above the symbols', () => {
    const d = curveBetween(box('a', 0, 100), box('b', 300, 100))
    const ys = [...d.matchAll(/-?\d+(\.\d+)?/g)].map(m => Number(m[0])).filter((_, i) => i % 2 === 1)
    expect(Math.min(...ys)).toBeLessThan(100)
  })

  it('joins identical twins only', () => {
    const f: FamilyConnector = {
      familyId: 'f1', anchorX: 50, anchorY: 0, implied: false, barY: 100, barX1: 0, barX2: 100,
      drops: [
        { childId: 'a', kind: 'bio', x: 0, y: 130, fromX: 50, twinGroup: 't', identicalTwin: true, secondary: false },
        { childId: 'b', kind: 'bio', x: 100, y: 130, fromX: 50, twinGroup: 't', identicalTwin: true, secondary: false },
      ],
    }
    expect(identicalTwinBars(f)).toMatch(/^M32\.5 110\.5H67\.5$/)
    f.drops.forEach(d => (d.identicalTwin = undefined))
    expect(identicalTwinBars(f)).toBe('')
  })

  it('formats ages and years', () => {
    expect(ageLabel({ age: 38 })).toBe('38')
    expect(ageLabel({ birthYear: 2000 }, 2026)).toBe('26')
    expect(ageLabel({ age: 90, deceased: true })).toBe('')
    expect(yearsLabel({ birthYear: 1910, deathYear: 1982 })).toBe('1910–1982')
    expect(yearsLabel({ deathYear: 1982 })).toBe('d. 1982')
  })
})

describe('Diagram', () => {
  it('renders every person, partnership and bond as a tap target', () => {
    const g = fixtures.example()
    const { body } = render(Diagram, { props: { g, res: layout(g), selected: { kind: 'person', id: 'p1' } } })
    for (const p of g.persons) expect(body).toContain(`data-id="${p.id}"`)
    for (const u of g.partnerships) expect(body).toContain(`data-kind="partnership" data-id="${u.id}"`)
    expect(body).toContain('data-kind="bond" data-id="b1"')
    expect(body).toContain('Counselor')
    expect(body).toMatch(/class="person[^"]*selected/)
    expect(body).toContain('selection-ring')
  })

  it('draws standard symbols: square, circle, diamond, deceased X, index ring', () => {
    const g = fixtures.example()
    const { body } = render(Diagram, { props: { g, res: layout(g) } })
    expect(body).toMatch(/<circle class="symbol/)
    expect(body).toMatch(/<rect class="symbol/)
    expect(body).toMatch(/<path class="symbol/) // River (non-binary) → diamond
    expect(body).toContain('class="deceased')
    expect(body).toContain('class="index-ring')
  })
})

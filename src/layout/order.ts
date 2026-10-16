import type { Family, Id } from '../model/types'
import type { LayoutGraph, Unit } from './graph'

/**
 * Order units left→right within each row to minimise line crossings.
 *
 * Sibling groups ("blocks": units sharing a home family) always stay together
 * and in birth order; sweeps only reorder whole blocks, using the barycenter of
 * their parents (down sweep) or children (up sweep). Couples may be mirrored.
 * The best sweep result is then polished by swapping neighbouring blocks
 * ("transpose") wherever that lowers crossings + line length.
 */
export function orderRows(lg: LayoutGraph, sweeps: number): Unit[][] {
  // Two starting orders; each wins on different family shapes. Keep the better.
  const attempts = [false, true].map(inLawsFirst => runOrdering(lg, sweeps, inLawsFirst))
  const best = attempts.reduce((a, b) => (b.score < a.score ? b : a))
  return best.rows.map(row => row.map(({ unit, members }) => ((unit.members = members), unit)))
}

/** Rows wider than this skip the (quadratic-ish) swap polish. Real genograms stay well under it. */
const TRANSPOSE_MAX_UNITS = 60

function runOrdering(lg: LayoutGraph, sweeps: number, inLawsFirst: boolean): { rows: Snapshot; score: number } {
  const rowCount = Math.max(0, ...lg.units.map(u => u.rank)) + 1
  const rows: Unit[][] = Array.from({ length: rowCount }, () => [])
  for (const u of initialOrder(lg, inLawsFirst)) rows[u.rank].push(u)
  applyCoupleConvention(lg)

  const ctx = new OrderContext(lg, rows)
  // Group siblings and put them in birth order before scoring anything.
  for (let r = 0; r < rowCount; r++) ctx.reorderRow(r, 'keep')
  let best = snapshot(rows)
  let bestCrossings = ctx.crossings()

  for (let s = 0; s < sweeps && bestCrossings > 0; s++) {
    for (let r = 1; r < rowCount; r++) ctx.reorderRow(r, 'down')
    for (let r = rowCount - 2; r >= 0; r--) ctx.reorderRow(r, 'up')
    ctx.flipCouples()
    const c = ctx.crossings()
    if (c < bestCrossings) {
      bestCrossings = c
      best = snapshot(rows)
    }
  }

  // Restore the best sweep result, then polish it with local swaps.
  best.forEach((row, r) => {
    rows[r].splice(0, rows[r].length, ...row.map(({ unit, members }) => ((unit.members = members), unit)))
    ctx.reindex(r)
  })
  for (let round = 0; round < 2; round++) {
    let improved = false
    for (let r = 0; r < rowCount; r++) {
      if (rows[r].length <= TRANSPOSE_MAX_UNITS) improved = ctx.transpose(r) || improved
    }
    if (!improved) break
  }
  return { rows: snapshot(rows), score: ctx.totalCost() }
}

type Snapshot = { unit: Unit; members: Id[] }[][]
const snapshot = (rows: Unit[][]): Snapshot =>
  rows.map(row => row.map(unit => ({ unit, members: [...unit.members] })))

/** Depth-first from the top rows so each family's descendants start out together. */
function initialOrder(lg: LayoutGraph, inLawsFirst: boolean): Unit[] {
  const out: Unit[] = []
  const seen = new Set<Unit>()
  const visit = (u: Unit) => {
    if (seen.has(u)) return
    seen.add(u)
    out.push(u)
    // Married-in members: place their own family now, so it starts next to them.
    for (const m of inLawsFirst ? u.members : []) {
      const f = lg.rel.primaryFamily.get(m)
      const pu = f && f !== u.home ? lg.parentUnit.get(f.id) : undefined
      if (pu) visit(pu)
    }
    for (const m of u.members) {
      for (const f of lg.rel.familiesAsParent.get(m) ?? []) {
        for (const c of f.children) {
          const cu = lg.unitOf.get(c.id)
          if (cu) visit(cu)
        }
      }
    }
  }
  const roots = [...lg.units].sort((a, b) => a.rank - b.rank || a.idx - b.idx)
  roots.forEach(visit)
  return out
}

/** Traditional couple order (male left) as the starting orientation. */
function applyCoupleConvention(lg: LayoutGraph) {
  for (const u of lg.units) {
    if (u.members.length !== 2 || !u.flippable) continue
    const [a, b] = u.members.map(id => lg.rel.person.get(id)!.sex)
    if (a === 'F' && b === 'M') u.members.reverse()
  }
}

class OrderContext {
  private pos = new Map<Unit, number>()

  constructor(
    private lg: LayoutGraph,
    private rows: Unit[][],
  ) {
    rows.forEach(row => this.index(row))
  }

  private index(row: Unit[]) {
    row.forEach((u, i) => this.pos.set(u, i))
  }

  reindex(r: number) {
    this.index(this.rows[r])
  }

  /** Fractional position of a person: unit index ± offset within the unit. */
  personPos(id: Id): number {
    const u = this.lg.unitOf.get(id)!
    const i = u.members.indexOf(id)
    return this.pos.get(u)! + ((i + 0.5) / u.members.length - 0.5) * 0.8
  }

  anchorPos(f: Family): number | undefined {
    const pu = this.lg.parentUnit.get(f.id)
    if (!pu) return undefined
    return mean(f.parents.map(p => this.personPos(p)))
  }

  private blockOf(u: Unit): string {
    return u.home ? u.home.id : `solo:${u.idx}`
  }

  private birthIndex(u: Unit): number {
    const kids = u.home?.children.map(c => c.id) ?? []
    return Math.min(...u.members.map(m => kids.indexOf(m)).filter(i => i >= 0), Infinity)
  }

  reorderRow(r: number, dir: 'down' | 'up' | 'keep') {
    const row = this.rows[r]
    const blocks = new Map<string, Unit[]>()
    for (const u of row) {
      const key = this.blockOf(u)
      if (!blocks.has(key)) blocks.set(key, [])
      blocks.get(key)!.push(u)
    }

    const scored = [...blocks.values()].map(units => {
      units.sort((a, b) => this.birthIndex(a) - this.birthIndex(b))
      const current = mean(units.map(u => this.pos.get(u)!))
      let bc: number | undefined
      if (dir === 'down') {
        const home = units[0].home
        const pu = home && this.lg.parentUnit.get(home.id)
        if (home && pu && pu.rank === r - 1) bc = this.anchorPos(home)
      } else if (dir === 'up') {
        const childPositions = units.flatMap(u => this.childPositions(u, r + 1))
        if (childPositions.length) bc = mean(childPositions)
      }
      return { units, bc: bc ?? current, current }
    })

    scored.sort((a, b) => a.bc - b.bc || a.current - b.current)
    const next = scored.flatMap(s => s.units)
    row.splice(0, row.length, ...next)
    this.index(row)
  }

  private childPositions(u: Unit, childRow: number): number[] {
    return u.members.flatMap(m =>
      (this.lg.rel.familiesAsParent.get(m) ?? []).flatMap(f =>
        f.children
          .filter(c => this.lg.unitOf.get(c.id)?.rank === childRow)
          .map(c => this.personPos(c.id)),
      ),
    )
  }

  /** Mirror flippable units when that brings members closer to their own relatives. */
  flipCouples() {
    for (const u of this.lg.units) {
      if (!u.flippable || u.members.length < 2) continue
      const pulls = u.members.map(m => this.pullOf(m, u))
      if (pulls.every(p => p === undefined)) continue
      const cost = () =>
        u.members.reduce((sum, m, i) => {
          const p = pulls[i]
          return p === undefined ? sum : sum + Math.abs(p - this.personPos(m))
        }, 0)
      const before = cost()
      u.members.reverse()
      pulls.reverse()
      if (cost() >= before) {
        u.members.reverse()
        pulls.reverse()
      }
    }
  }

  /** Where a member's own (non-shared) relatives are: their parents, and children not shared with the unit. */
  private pullOf(m: Id, u: Unit): number | undefined {
    const targets: number[] = []
    const f = this.lg.rel.primaryFamily.get(m)
    const pu = f && this.lg.parentUnit.get(f.id)
    if (f && pu && pu !== u) targets.push(this.anchorPos(f)!)
    for (const fam of this.lg.rel.familiesAsParent.get(m) ?? []) {
      if (fam.parents.length === 2) continue
      for (const c of fam.children) if (this.lg.unitOf.has(c.id)) targets.push(this.personPos(c.id))
    }
    return targets.length ? mean(targets) : undefined
  }

  /** Parent-anchor → child edges between row r and r+1, as (upper, lower) positions. */
  private edgesBelow(r: number): [number, number][] {
    const edges: [number, number][] = []
    if (r < 0 || r + 1 >= this.rows.length) return edges
    for (const u of this.rows[r + 1]) {
      for (const m of u.members) {
        const f = this.lg.rel.primaryFamily.get(m)
        const pu = f && this.lg.parentUnit.get(f.id)
        if (f && pu && pu.rank === r) edges.push([this.anchorPos(f)!, this.personPos(m)])
      }
    }
    return edges
  }

  /** Total crossings between parent anchors and their children across adjacent rows. */
  crossings(): number {
    let total = 0
    for (let r = 0; r + 1 < this.rows.length; r++) total += countCrossings(this.edgesBelow(r))
    return total
  }

  /** Crossings (dominant) plus line length over the whole diagram. */
  totalCost(): number {
    let cost = 0
    for (let r = 0; r + 1 < this.rows.length; r++) {
      const edges = this.edgesBelow(r)
      cost += countCrossings(edges) * 1000
      for (const [a, b] of edges) cost += Math.abs(a - b)
    }
    return cost
  }

  /** Crossings (dominant) plus line length for the edges touching row r. */
  private rowCost(r: number): number {
    let cost = 0
    for (const edges of [this.edgesBelow(r - 1), this.edgesBelow(r)]) {
      cost += countCrossings(edges) * 1000
      for (const [a, b] of edges) cost += Math.abs(a - b)
    }
    return cost
  }

  /** Swap neighbouring blocks and mirror couples in row r while that lowers its cost. */
  transpose(r: number): boolean {
    const row = this.rows[r]
    let improvedAny = false
    for (let changed = true, pass = 0; changed && pass < 2; pass++) {
      changed = false
      const blocks = this.blocksInOrder(row)
      for (let i = 0; i + 1 < blocks.length; i++) {
        const before = this.rowCost(r)
        ;[blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]]
        row.splice(0, row.length, ...blocks.flat())
        this.index(row)
        if (this.rowCost(r) < before - 1e-9) {
          changed = improvedAny = true
        } else {
          ;[blocks[i], blocks[i + 1]] = [blocks[i + 1], blocks[i]]
          row.splice(0, row.length, ...blocks.flat())
          this.index(row)
        }
      }
      for (const u of row) {
        if (!u.flippable || u.members.length < 2) continue
        const before = this.rowCost(r)
        u.members.reverse()
        if (this.rowCost(r) < before - 1e-9) changed = improvedAny = true
        else u.members.reverse()
      }
    }
    return improvedAny
  }

  private blocksInOrder(row: Unit[]): Unit[][] {
    const blocks: Unit[][] = []
    for (const u of row) {
      const last = blocks[blocks.length - 1]
      if (last && this.blockOf(last[0]) === this.blockOf(u)) last.push(u)
      else blocks.push([u])
    }
    return blocks
  }
}

/** Inversions among edges sorted by upper end = crossings. O(n log n). */
function countCrossings(edges: [number, number][]): number {
  const lower = [...edges].sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(e => e[1])
  const sortCount = (xs: number[]): number => {
    if (xs.length < 2) return 0
    const mid = xs.length >> 1
    const left = xs.slice(0, mid)
    const right = xs.slice(mid)
    let count = sortCount(left) + sortCount(right)
    let i = 0
    let j = 0
    let k = 0
    while (i < left.length && j < right.length) {
      if (right[j] < left[i]) {
        count += left.length - i
        xs[k++] = right[j++]
      } else xs[k++] = left[i++]
    }
    while (i < left.length) xs[k++] = left[i++]
    while (j < right.length) xs[k++] = right[j++]
    return count
  }
  return sortCount(lower)
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

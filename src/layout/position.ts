import type { Family } from '../model/types'
import { anchorX, personX, sizeUnit } from './geometry'
import type { LayoutGraph, Unit } from './graph'
import type { LayoutOptions } from './types'

/**
 * Assign unit center x's for fixed row orders.
 *
 * Each pass computes, for every unit, where it would like to be (parents
 * centered over their children, sibling groups centered under their parents)
 * and then places the row as close to those targets as possible while keeping
 * order and minimum gaps — an exact weighted isotonic regression (PAVA).
 */
export function positionRows(lg: LayoutGraph, rows: Unit[][], o: LayoutOptions): void {
  for (const u of lg.units) sizeUnit(lg, u, o)
  for (const row of rows) pack(row, gapsFor(row, o))

  const childMid = (f: Family): number | undefined => {
    const xs = f.children
      .filter(c => lg.rel.primaryFamily.get(c.id) === f && lg.unitOf.has(c.id))
      .map(c => personX(lg, c.id, o))
    return xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : undefined
  }

  const target = (u: Unit): { x: number; w: number } => {
    let sum = 0
    let w = 0
    // Pull toward parents: shift so the sibling group is centered under its anchor.
    for (const m of u.members) {
      const f = lg.rel.primaryFamily.get(m)
      const pu = f && lg.parentUnit.get(f.id)
      if (!f || !pu || pu.rank >= u.rank) continue
      const a = anchorX(lg, f, o)
      const mid = childMid(f)
      if (a !== undefined && mid !== undefined) {
        sum += a - mid
        w += 1
      }
    }
    // Pull toward children: shift so each family anchor sits over its children.
    for (const m of u.members) {
      for (const f of lg.rel.familiesAsParent.get(m) ?? []) {
        if (f.parents[0] !== m && f.parents.length === 2) continue // count shared families once
        const mid = childMid(f)
        const a = anchorX(lg, f, o)
        if (a !== undefined && mid !== undefined) {
          sum += mid - a
          w += 1
        }
      }
    }
    return w ? { x: u.x + sum / w, w } : { x: u.x, w: 0.05 }
  }

  const solveRow = (row: Unit[]) => {
    if (!row.length) return
    const targets = row.map(target)
    const xs = pava(
      targets.map(t => t.x),
      targets.map(t => t.w),
      gapsFor(row, o),
    )
    row.forEach((u, i) => (u.x = xs[i]))
  }

  for (let p = 0; p < o.positionPasses; p++) {
    for (let r = 0; r < rows.length; r++) solveRow(rows[r])
    for (let r = rows.length - 1; r >= 0; r--) solveRow(rows[r])
  }

  const minX = Math.min(...lg.units.map(u => u.x - u.width / 2))
  for (const u of lg.units) u.x -= minX
}

/** Minimum center-to-center distance between consecutive units. */
function gapsFor(row: Unit[], o: LayoutOptions): number[] {
  const gaps: number[] = []
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i]
    const b = row[i + 1]
    const sameBlock = a.home !== undefined && a.home === b.home
    gaps.push(a.width / 2 + b.width / 2 + (sameBlock ? o.unitGap : o.blockGap))
  }
  return gaps
}

function pack(row: Unit[], gaps: number[]) {
  let x = 0
  row.forEach((u, i) => {
    u.x = x
    x += gaps[i] ?? 0
  })
}

/**
 * Weighted least squares: minimise Σ w_i (x_i − t_i)² subject to
 * x_{i+1} − x_i ≥ gaps_i. Substituting y_i = x_i − offset_i turns the gaps into
 * plain monotonicity, solved exactly by pool-adjacent-violators.
 */
export function pava(targets: number[], weights: number[], gaps: number[]): number[] {
  const n = targets.length
  const offset = new Array<number>(n)
  offset[0] = 0
  for (let i = 1; i < n; i++) offset[i] = offset[i - 1] + gaps[i - 1]

  const blocks: { value: number; weight: number; count: number }[] = []
  for (let i = 0; i < n; i++) {
    blocks.push({ value: targets[i] - offset[i], weight: weights[i], count: 1 })
    while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value) {
      const b = blocks.pop()!
      const a = blocks[blocks.length - 1]
      const weight = a.weight + b.weight
      a.value = (a.value * a.weight + b.value * b.weight) / weight
      a.weight = weight
      a.count += b.count
    }
  }

  const out: number[] = []
  for (const b of blocks) for (let k = 0; k < b.count; k++) out.push(b.value + offset[out.length])
  return out
}

import type { LayoutGraph, Unit } from './graph'

/**
 * Assign each unit a generation row (0 = top).
 *
 * Rules: children sit one row below their parents' unit, and all children of a
 * family share a row. Then units with no parents on the chart (e.g. an in-law's
 * parents) are pulled down to sit directly above their children.
 */
export function assignRanks(lg: LayoutGraph): void {
  const { g, units, unitOf, parentUnit } = lg
  for (const u of units) u.rank = 0

  const childUnits = new Map<string, Unit[]>()
  for (const f of g.families) {
    const parent = parentUnit.get(f.id)
    const kids = [...new Set(f.children.map(c => unitOf.get(c.id)).filter((u): u is Unit => !!u))]
    // A unit can't be its own parent's row-mate (bad data); ignore such children.
    childUnits.set(f.id, kids.filter(u => u !== parent))
  }

  // Longest-path layering with sibling equality. Ranks only grow, so this
  // terminates; the cap guards against cycles in malformed data.
  const relax = () => {
    for (let iter = 0, changed = true; changed && iter <= units.length; iter++) {
      changed = false
      for (const f of g.families) {
        const kids = childUnits.get(f.id)!
        if (!kids.length) continue
        const parent = parentUnit.get(f.id)
        const row = Math.max(parent ? parent.rank + 1 : 0, ...kids.map(u => u.rank))
        for (const u of kids) {
          if (u.rank !== row) {
            u.rank = row
            changed = true
          }
        }
      }
    }
  }
  relax()

  // Pull parentless units down to just above their highest child row.
  const hasParents = new Set<Unit>()
  for (const kids of childUnits.values()) kids.forEach(u => hasParents.add(u))
  for (const u of [...units].sort((a, b) => b.rank - a.rank)) {
    if (hasParents.has(u)) continue
    const childRows = g.families
      .filter(f => parentUnit.get(f.id) === u)
      .flatMap(f => childUnits.get(f.id)!.map(k => k.rank))
    if (childRows.length) u.rank = Math.max(u.rank, Math.min(...childRows) - 1)
  }
  relax()

  const min = Math.min(...units.map(u => u.rank))
  for (const u of units) u.rank -= min
}

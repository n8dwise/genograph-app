import type { Id } from './types'

/**
 * Next readable ID for a prefix, e.g. `nextId(['p1', 'p4'], 'p') === 'p5'`.
 * Readable IDs keep exported JSON easy to hand-edit or generate with an AI.
 * IDs not matching `<prefix><number>` are ignored.
 */
export function nextId(existing: Iterable<Id>, prefix: string): Id {
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const id of existing) {
    const m = pattern.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

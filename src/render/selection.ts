/** What the user tapped. `id` is the record id of that kind. */
export type Selection =
  | { kind: 'person'; id: string }
  | { kind: 'partnership'; id: string }
  | { kind: 'relationship'; id: string }
  | { kind: 'bond'; id: string }

export const SELECTABLE_KINDS = ['person', 'partnership', 'relationship', 'bond'] as const

/** Read the selection target from an event target inside the diagram (via data-kind / data-id). */
export function selectionFromElement(el: Element | null): Selection | null {
  const hit = el?.closest<HTMLElement | SVGElement>('[data-kind][data-id]')
  if (!hit) return null
  const kind = hit.dataset.kind as Selection['kind']
  const id = hit.dataset.id!
  return (SELECTABLE_KINDS as readonly string[]).includes(kind) ? ({ kind, id } as Selection) : null
}

export const sameSelection = (a: Selection | null, b: Selection | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id)

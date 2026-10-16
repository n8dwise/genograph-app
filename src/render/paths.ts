import type { ChildDrop, FamilyConnector, PartnerLine, PersonBox } from '../layout/types'
import type {
  BondType, ChildKind, PartnershipStatus, PartnershipType, Quality, RelationshipKind,
} from '../model/types'

// SVG path geometry and line styles. Pure functions: easy to test, shared by
// the interactive canvas and image export.

export interface LineStyle {
  dash?: string
  /** CSS color or var(). Defaults to the ink color. */
  color?: string
  width?: number
}

// ── partner lines ────────────────────────────────────────────────────────────

export function partnerPath(l: PartnerLine): string {
  return `M${l.xA} ${l.yTop}V${l.y}H${l.xB}V${l.yTop}`
}

const PARTNER_DASH: Record<PartnershipType, string | undefined> = {
  married: undefined,
  cohabiting: '7 4',
  dating: '2 4',
  affair: '8 3 2 3',
  other: '4 3',
}

export function partnerStyle(type: PartnershipType | undefined, quality?: Quality): LineStyle {
  return { dash: type ? PARTNER_DASH[type] : '4 3', color: qualityColor(quality) }
}

/**
 * Status marks across the partner line: one slash = separated, two = divorced.
 * Placed left of center so they don't sit on the children's spine.
 */
export function statusMarks(l: PartnerLine, status: PartnershipStatus | undefined): string {
  const count = status === 'divorced' ? 2 : status === 'separated' ? 1 : 0
  if (!count) return ''
  const left = Math.min(l.xA, l.xB)
  const x0 = left + Math.abs(l.xB - l.xA) * 0.32
  const marks: string[] = []
  for (let i = 0; i < count; i++) {
    const x = x0 + i * 7
    marks.push(`M${x - 4} ${l.y + 7}L${x + 4} ${l.y - 7}`)
  }
  return marks.join('')
}

export function qualityColor(q: Quality | undefined): string | undefined {
  return q ? `var(--quality-${q})` : undefined
}

// ── family connectors ────────────────────────────────────────────────────────

/** Spine from parents (or single-parent stub / implied stub) down to the sibling bar, plus the bar. */
export function familyTrunk(f: FamilyConnector): string {
  const stub = f.parentStub ? `M${f.parentStub.x} ${f.parentStub.yTop}V${f.anchorY}H${f.anchorX}` : ''
  const bar = f.barX2 > f.barX1 ? `M${f.barX1} ${f.barY}H${f.barX2}` : ''
  return `${stub}M${f.anchorX} ${f.anchorY}V${f.barY}${bar}`
}

export function dropPath(f: FamilyConnector, d: ChildDrop): string {
  return `M${d.fromX} ${f.barY}L${d.x} ${d.y}`
}

const CHILD_DASH: Record<ChildKind, string | undefined> = {
  bio: undefined,
  adopted: '6 4',
  foster: '2 4',
  step: '8 3 2 3',
}

export function dropStyle(d: ChildDrop): LineStyle {
  return { dash: CHILD_DASH[d.kind], color: d.secondary ? 'var(--ink-faint)' : undefined }
}

/** Horizontal bar joining identical twins' drops, a third of the way down. */
export function identicalTwinBars(f: FamilyConnector): string {
  const groups = new Map<string, ChildDrop[]>()
  for (const d of f.drops) {
    if (!d.identicalTwin || !d.twinGroup) continue
    groups.set(d.twinGroup, [...(groups.get(d.twinGroup) ?? []), d])
  }
  const t = 0.35
  const parts: string[] = []
  for (const drops of groups.values()) {
    if (drops.length < 2) continue
    const pts = drops
      .map(d => ({ x: d.fromX + (d.x - d.fromX) * t, y: f.barY + (d.y - f.barY) * t }))
      .sort((a, b) => a.x - b.x)
    parts.push(`M${pts[0].x} ${pts[0].y}H${pts[pts.length - 1].x}`)
  }
  return parts.join('')
}

// ── emotional relationships & bonds ──────────────────────────────────────────

/**
 * Curved line between two people. Same row: arc above the symbols so it
 * doesn't run through anyone between them. Different rows: gentle S between
 * the facing edges.
 */
export function curveBetween(a: PersonBox, b: PersonBox, lift = 0): string {
  if (Math.abs(a.y - b.y) < 1) {
    const [l, r] = a.cx <= b.cx ? [a, b] : [b, a]
    const peak = Math.min(l.y, r.y) - 18 - Math.min(80, (r.cx - l.cx) * 0.12) - lift
    return `M${l.cx} ${l.y}C${l.cx} ${peak} ${r.cx} ${peak} ${r.cx} ${r.y}`
  }
  const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
  const y1 = top.y + top.size
  const y2 = bottom.y
  const my = (y1 + y2) / 2
  return `M${top.cx} ${y1}C${top.cx + lift} ${my} ${bottom.cx + lift} ${my} ${bottom.cx} ${y2}`
}

/** Approximate midpoint of `curveBetween` (for labels). */
export function curveMidpoint(a: PersonBox, b: PersonBox, lift = 0): { x: number; y: number } {
  if (Math.abs(a.y - b.y) < 1) {
    const peak = Math.min(a.y, b.y) - 18 - Math.min(80, Math.abs(b.cx - a.cx) * 0.12) - lift
    return { x: (a.cx + b.cx) / 2, y: a.y + (peak - a.y) * 0.75 }
  }
  const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
  return { x: (top.cx + bottom.cx) / 2 + lift * 0.75, y: (top.y + top.size + bottom.y) / 2 }
}

/**
 * Basic styling per emotional relationship. Phase 6 replaces the abuse /
 * conflict / fused families with proper glyph patterns (zigzags, triple lines).
 */
export function relationshipStyle(kind: RelationshipKind): LineStyle {
  switch (kind) {
    case 'harmony':
    case 'close':
    case 'love':
      return { color: 'var(--rel-positive)', width: 2 }
    case 'fused':
    case 'enmeshed':
      return { color: 'var(--rel-positive)', width: 4 }
    case 'distant':
    case 'indifferent':
      return { color: 'var(--rel-neutral)', dash: '3 5' }
    case 'cutoff':
      return { color: 'var(--rel-neutral)', dash: '12 6', width: 2 }
    case 'focused-on':
    case 'distrust':
      return { color: 'var(--rel-caution)', dash: '6 3', width: 2 }
    case 'discord':
    case 'close-hostile':
    case 'hostile':
      return { color: 'var(--rel-negative)', width: 2, dash: kind === 'close-hostile' ? '10 3' : undefined }
    case 'neglect':
      return { color: 'var(--rel-negative)', dash: '2 4', width: 2 }
    default:
      // violence & abuse
      return { color: 'var(--rel-negative)', width: 3 }
  }
}

export const BOND_LABELS: Record<BondType, string> = {
  guardian: 'Guardian',
  'close-friend': 'Close friend',
  counselor: 'Counselor',
  mentor: 'Mentor',
  caregiver: 'Caregiver',
  sponsor: 'Sponsor',
  'important-adult': 'Important adult',
  other: 'Other',
}

export function bondOpacity(q: Quality | undefined): number {
  return q === 'conflicted' ? 0.5 : q === 'strained' ? 0.7 : 1
}

// ── labels ───────────────────────────────────────────────────────────────────

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

/** "1962–", "1910–1982", "d. 1982" — or '' when nothing is known. */
export function yearsLabel(p: { birthYear?: number; deathYear?: number; deceased?: boolean }): string {
  if (p.birthYear !== undefined) return `${p.birthYear}–${p.deathYear ?? ''}`
  if (p.deathYear !== undefined) return `d. ${p.deathYear}`
  return ''
}

/** Age shown inside the symbol (living people only). */
export function ageLabel(
  p: { age?: number; birthYear?: number; deceased?: boolean },
  year = new Date().getFullYear(),
): string {
  if (p.deceased) return ''
  if (p.age !== undefined) return String(p.age)
  if (p.birthYear !== undefined) return String(year - p.birthYear)
  return ''
}

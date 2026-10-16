import type { ChildKind, Id } from '../model/types'

export interface LayoutOptions {
  /** Square/circle symbol edge length. */
  symbolSize: number
  /** Horizontal space reserved per person (symbol + breathing room for the years line). */
  slotWidth: number
  /** Gap between partners inside a couple/multi-partner unit. */
  partnerGap: number
  /** Gap between units in the same sibling group. */
  unitGap: number
  /** Gap between different sibling groups on a row. */
  blockGap: number
  /** Depth of the partner "U" line below the symbol. */
  partnerDrop: number
  /** Extra depth per nesting level for non-adjacent partners. */
  nestStep: number
  /** Distance from symbol bottom to the years label (holds partner lines). */
  labelOffset: number
  /** Height reserved for the years label under the symbol. */
  labelHeight: number
  /** Vertical space between label bottom and next row's symbols. */
  rowGap: number
  /** Sibling bar distance above the children's symbols. */
  siblingBarOffset: number
  /** Vertical spacing between overlapping sibling bars on one row. */
  trackGap: number
  /** Height of the stub drawn above implied (off-chart) parents' bar. */
  impliedStub: number
  /** Ordering sweeps (each = one down + one up pass). */
  sweeps: number
  /** Horizontal positioning passes. */
  positionPasses: number
}

export const defaultLayoutOptions: LayoutOptions = {
  // Names sit inside the symbols, so symbols are large and only a short
  // birth–death line sits below (under the partner-line band).
  symbolSize: 64,
  slotWidth: 84,
  partnerGap: 16,
  unitGap: 20,
  blockGap: 40,
  partnerDrop: 12,
  nestStep: 7,
  labelOffset: 28,
  labelHeight: 14,
  rowGap: 44,
  siblingBarOffset: 22,
  trackGap: 10,
  impliedStub: 12,
  sweeps: 8,
  positionPasses: 12,
}

/** Symbol placement. x/y = symbol top-left. */
export interface PersonBox {
  id: Id
  x: number
  y: number
  size: number
  /** Symbol center. */
  cx: number
  cy: number
  /** Top of the years label under the symbol (centered on cx). */
  labelY: number
  rank: number
  /** True for support figures drawn in the row under the family. */
  support: boolean
}

/** Partner "U": down from each symbol bottom (yTop) to y, then across. */
export interface PartnerLine {
  /** Partnership id, or `family:<id>` for parents with no partnership record. */
  id: string
  partnershipId?: Id
  a: Id
  b: Id
  xA: number
  xB: number
  yTop: number
  y: number
}

export interface ChildDrop {
  childId: Id
  kind: ChildKind
  /** Child symbol center x and top y. */
  x: number
  y: number
  /** Where the drop leaves the sibling bar (differs from x for twins). */
  fromX: number
  twinGroup?: string
  identicalTwin?: boolean
  /** Child is drawn under another family (e.g. bio family of an adopted child). */
  secondary: boolean
}

export interface FamilyConnector {
  familyId: Id
  /** Where the spine starts: partner line midpoint, single-parent stub end, or implied stub top. */
  anchorX: number
  anchorY: number
  /** No parents on the chart. */
  implied: boolean
  /** Single parent: vertical from (x, yTop) down to anchorY, then across to anchorX. */
  parentStub?: { x: number; yTop: number }
  barY: number
  barX1: number
  barX2: number
  drops: ChildDrop[]
}

export interface LayoutResult {
  boxes: Map<Id, PersonBox>
  partnerLines: PartnerLine[]
  families: FamilyConnector[]
  bounds: { x: number; y: number; width: number; height: number }
}

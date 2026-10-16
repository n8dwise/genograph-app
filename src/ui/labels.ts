import type {
  BondType, ChildKind, PartnershipStatus, PartnershipType, Quality, RelationshipKind, Sex,
} from '../model/types'

// User-facing names for every enum in the model.

export const SEX_LABELS: Record<Sex, string> = { M: 'Male', F: 'Female', X: 'Non-binary', '?': 'Unknown' }

export const PARTNERSHIP_TYPE_LABELS: Record<PartnershipType, string> = {
  married: 'Married',
  cohabiting: 'Living together',
  dating: 'Dating',
  affair: 'Affair',
  other: 'Other',
}

export const PARTNERSHIP_STATUS_LABELS: Record<PartnershipStatus, string> = {
  active: 'Together',
  separated: 'Separated',
  divorced: 'Divorced',
  widowed: 'Widowed',
}

export const QUALITY_LABELS: Record<Quality, string> = {
  good: 'Good',
  strained: 'Strained',
  conflicted: 'Conflicted',
}

export const CHILD_KIND_LABELS: Record<ChildKind, string> = {
  bio: 'Biological',
  adopted: 'Adopted',
  foster: 'Foster',
  step: 'Step',
}

export const BOND_TYPE_LABELS: Record<BondType, string> = {
  guardian: 'Guardian',
  'close-friend': 'Close friend',
  counselor: 'Counselor / therapist',
  mentor: 'Mentor',
  caregiver: 'Caregiver',
  sponsor: 'Sponsor',
  'important-adult': 'Important adult',
  other: 'Other',
}

export const RELATIONSHIP_GROUPS: { label: string; kinds: [RelationshipKind, string][] }[] = [
  {
    label: 'Positive',
    kinds: [
      ['harmony', 'Harmony'],
      ['close', 'Close'],
      ['love', 'Love / admiration'],
    ],
  },
  {
    label: 'Over-involved',
    kinds: [
      ['fused', 'Very close / fused'],
      ['enmeshed', 'Enmeshed'],
      ['focused-on', 'Focused on'],
    ],
  },
  {
    label: 'Distant',
    kinds: [
      ['distant', 'Distant'],
      ['indifferent', 'Indifferent'],
      ['cutoff', 'Cutoff'],
      ['distrust', 'Distrust'],
    ],
  },
  {
    label: 'Conflict',
    kinds: [
      ['discord', 'Discord / conflict'],
      ['hostile', 'Hostile'],
      ['close-hostile', 'Close–hostile'],
    ],
  },
  {
    label: 'Abuse & neglect',
    kinds: [
      ['violence', 'Violence'],
      ['physical-abuse', 'Physical abuse'],
      ['emotional-abuse', 'Emotional abuse'],
      ['sexual-abuse', 'Sexual abuse'],
      ['neglect', 'Neglect'],
    ],
  },
]

export const RELATIONSHIP_LABELS = Object.fromEntries(
  RELATIONSHIP_GROUPS.flatMap(g => g.kinds),
) as Record<RelationshipKind, string>

/** "3 min ago", "Yesterday", "12 Mar 2026". */
export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso)
  const mins = Math.round((now.getTime() - t.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24 && t.getDate() === now.getDate()) return `${hours} h ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (t.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

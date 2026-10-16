import { z } from 'zod'
import type { Genogram } from './types'

// Zod mirror of types.ts. `satisfies` below keeps the two in sync.

const id = z.string().min(1)
const year = z.number().int().min(0).max(3000)
const quality = z.enum(['good', 'strained', 'conflicted'])

const person = z.object({
  id,
  name: z.string(),
  sex: z.enum(['M', 'F', 'X', '?']),
  birthYear: year.optional(),
  deathYear: year.optional(),
  age: z.number().int().min(0).max(150).optional(),
  deceased: z.boolean().optional(),
  isIndexPerson: z.boolean().optional(),
  notes: z.string().optional(),
})

const partnership = z.object({
  id,
  a: id,
  b: id,
  type: z.enum(['married', 'cohabiting', 'dating', 'affair', 'other']),
  status: z.enum(['active', 'separated', 'divorced', 'widowed']),
  label: z.string().optional(),
  startYear: year.optional(),
  endYear: year.optional(),
  quality: quality.optional(),
})

const family = z.object({
  id,
  parents: z.array(id).max(2),
  partnershipId: id.optional(),
  children: z.array(
    z.object({
      id,
      kind: z.enum(['bio', 'adopted', 'foster', 'step']),
      twinGroup: z.string().optional(),
      identicalTwin: z.boolean().optional(),
    }),
  ),
})

const relationship = z.object({
  id,
  a: id,
  b: id,
  kind: z.enum([
    'harmony', 'close', 'fused', 'enmeshed', 'distant', 'cutoff', 'discord', 'hostile',
    'close-hostile', 'violence', 'physical-abuse', 'emotional-abuse', 'sexual-abuse',
    'neglect', 'focused-on', 'distrust', 'love', 'indifferent',
  ]),
  note: z.string().optional(),
})

const bond = z.object({
  id,
  personId: id,
  supportId: id,
  type: z.enum([
    'guardian', 'close-friend', 'counselor', 'mentor', 'caregiver', 'sponsor',
    'important-adult', 'other',
  ]),
  label: z.string().optional(),
  quality: quality.optional(),
})

const household = z.object({
  id,
  members: z.array(id),
  label: z.string().optional(),
})

export const genogramSchema = z.object({
  meta: z.object({
    version: z.literal(2),
    title: z.string(),
    created: z.string(),
    updated: z.string(),
  }),
  persons: z.array(person),
  partnerships: z.array(partnership).default([]),
  families: z.array(family).default([]),
  relationships: z.array(relationship).default([]),
  bonds: z.array(bond).default([]),
  households: z.array(household).default([]),
  pins: z.record(z.string(), z.object({ dx: z.number(), dy: z.number() })).default({}),
})

// Compile-time check that the schema output matches the hand-written types.
type SchemaOut = z.output<typeof genogramSchema>
export const _typeCheck = (g: SchemaOut): Genogram => g satisfies Genogram

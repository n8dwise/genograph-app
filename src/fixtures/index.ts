// Sample families from v1, converted to v2. Used by tests and the debug viewer.
import { migratePersonList, migrateV1, type DemoPerson, type V1Data } from '../model/migrate'
import type { Genogram } from '../model/types'
import benchmark from './legacy/benchmark.json'
import britishRoyals from './legacy/british-royals.json'
import example from './legacy/example.json'
import relationshipChart from './legacy/relationship-chart.json'
import thompson from './legacy/thompson.json'

export const fixtures: Record<string, () => Genogram> = {
  example: () => migrateV1(example as V1Data).genogram,
  thompson: () => migratePersonList(thompson as DemoPerson[], 'Thompson').genogram,
  'british-royals': () => migratePersonList(britishRoyals as DemoPerson[], 'British Royals').genogram,
  'relationship-chart': () =>
    migratePersonList(relationshipChart as DemoPerson[], 'Relationship Chart').genogram,
  benchmark: () => migratePersonList(benchmark as DemoPerson[], 'Benchmark').genogram,
}

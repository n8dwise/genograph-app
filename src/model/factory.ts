import type { Genogram } from './types'

export function createGenogram(title = '', now = new Date()): Genogram {
  const ts = now.toISOString()
  return {
    meta: { version: 2, title, created: ts, updated: ts },
    persons: [],
    partnerships: [],
    families: [],
    relationships: [],
    bonds: [],
    households: [],
    pins: {},
  }
}

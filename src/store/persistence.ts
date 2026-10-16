import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'
import { validateGenogram } from '../model/validate'
import type { Genogram } from '../model/types'

// "My Genograms": documents saved on this device only (IndexedDB).
// Nothing here talks to a network.

export interface DocSummary {
  id: string
  title: string
  updated: string
  people: number
}

/** Minimal key-value surface so storage can be swapped (tests, future encryption). */
export interface KeyValue {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  entries(): Promise<[string, unknown][]>
}

export function indexedDbKeyValue(dbName = 'genograph', storeName = 'docs'): KeyValue {
  let store: UseStore | undefined
  const s = () => (store ??= createStore(dbName, storeName))
  return {
    get: key => get(key, s()),
    set: (key, value) => set(key, value, s()),
    delete: key => del(key, s()),
    entries: async () => (await entries(s())).map(([k, v]) => [String(k), v]),
  }
}

export function memoryKeyValue(): KeyValue {
  const m = new Map<string, unknown>()
  return {
    get: async k => structuredClone(m.get(k)),
    set: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async k => void m.delete(k),
    entries: async () => [...m.entries()].map(([k, v]) => [k, structuredClone(v)]),
  }
}

const DOC = 'doc:'

export class DocLibrary {
  constructor(private kv: KeyValue) {}

  async list(): Promise<DocSummary[]> {
    const docs: DocSummary[] = []
    for (const [key, value] of await this.kv.entries()) {
      if (!key.startsWith(DOC)) continue
      const g = value as Genogram
      docs.push({ id: key.slice(DOC.length), title: g.meta.title, updated: g.meta.updated, people: g.persons.length })
    }
    return docs.sort((a, b) => b.updated.localeCompare(a.updated))
  }

  /** Load and re-validate (storage could hold data from an older app version). */
  async load(id: string): Promise<Genogram | undefined> {
    const raw = await this.kv.get(DOC + id)
    if (raw === undefined) return undefined
    const result = validateGenogram(raw)
    if (!result.ok) throw new Error(`Saved genogram is damaged: ${result.errors[0]}`)
    return result.genogram
  }

  async save(id: string, g: Genogram): Promise<void> {
    await this.kv.set(DOC + id, g)
  }

  async remove(id: string): Promise<void> {
    await this.kv.delete(DOC + id)
  }

  async duplicate(id: string, newId: string, now = new Date()): Promise<Genogram> {
    const g = await this.load(id)
    if (!g) throw new Error('Genogram not found.')
    const copy = structuredClone(g)
    copy.meta.title = `${g.meta.title || 'Untitled'} (copy)`
    copy.meta.created = copy.meta.updated = now.toISOString()
    await this.save(newId, copy)
    return copy
  }
}

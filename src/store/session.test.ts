import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import example from '../fixtures/legacy/example.json'
import { exportGenogram } from '../io/json'
import { History } from './history'
import { addPartner, CommandError, deletePerson, updatePerson } from './commands'
import { DocLibrary, indexedDbKeyValue, memoryKeyValue } from './persistence'
import { Session, type SessionState } from './session'

describe('History', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    const h = new History(0)
    h.push(1)
    h.push(2)
    expect(h.undo()).toBe(1)
    expect(h.redo()).toBe(2)
    h.undo()
    h.push(3)
    expect(h.canRedo).toBe(false)
    expect([h.undo(), h.undo(), h.undo()]).toEqual([1, 0, undefined])
  })

  it('coalesces rapid edits with the same key', () => {
    const h = new History('')
    h.push('A', 'name', 0)
    h.push('Al', 'name', 300)
    h.push('Ale', 'name', 600)
    h.push('Alex', 'age', 700)
    expect(h.undo()).toBe('Ale')
    expect(h.undo()).toBe('')
  })

  it('caps history length', () => {
    const h = new History(0, 3)
    for (let i = 1; i <= 10; i++) h.push(i)
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([9, 8, 7, undefined])
  })
})

function setup(opts: { autosave?: boolean } = {}) {
  const library = new DocLibrary(memoryKeyValue())
  let n = 0
  const session = new Session(library, { debounceMs: 10, newId: () => `doc${++n}`, ...opts })
  const states: SessionState[] = []
  session.subscribe(s => states.push(s))
  return { library, session, states, last: () => states[states.length - 1] }
}

const subject = { name: 'Alex', sex: 'M' as const }

describe('Session', () => {
  it('creates, edits, undoes and autosaves', async () => {
    const { library, session, last } = setup()
    const id = await session.create('Client A', subject)
    expect(await library.list()).toMatchObject([{ id, title: 'Client A', people: 1 }])

    const alex = last().doc!.persons[0].id
    const jordan = session.apply(g => addPartner(g, alex, { name: 'Jordan', sex: 'F' }))
    expect(last().doc!.persons).toHaveLength(2)
    expect(last()).toMatchObject({ canUndo: true, saveStatus: 'pending' })

    await session.flush()
    expect(last().saveStatus).toBe('saved')
    expect((await library.load(id))!.persons).toHaveLength(2)

    session.undo()
    expect(last().doc!.persons).toHaveLength(1)
    session.redo()
    expect(last().doc!.persons.map(p => p.id)).toContain(jordan)
  })

  it('leaves the document untouched when a command is refused', async () => {
    const { session, last } = setup()
    await session.create('', subject)
    const before = last().doc
    expect(() => session.apply(g => deletePerson(g, g.persons[0].id))).toThrow(CommandError)
    expect(last().doc).toBe(before)
    expect(last().canUndo).toBe(false)
  })

  it('coalesces typing into one undo step', async () => {
    const { session, last } = setup()
    await session.create('', subject)
    const id = last().doc!.persons[0].id
    for (const name of ['A', 'Al', 'Ali']) session.apply(g => updatePerson(g, id, { name }), `name:${id}`)
    session.undo()
    expect(last().doc!.persons[0].name).toBe('Alex')
  })

  it('writes nothing to the device with autosave off until save()', async () => {
    const { library, session, last } = setup({ autosave: false })
    const id = await session.create('Private', subject)
    session.apply(g => updatePerson(g, g.persons[0].id, { age: 30 }))
    await session.flush()
    expect(await library.list()).toEqual([])
    expect(last().saveStatus).toBe('idle')
    await session.save()
    expect((await library.load(id))!.persons[0].age).toBe(30)
  })

  it('reopens a saved genogram, and imports v1 files', async () => {
    const { library, session, last } = setup()
    const a = await session.create('A', subject)
    const result = await session.importText(JSON.stringify(example))
    expect(result.ok).toBe(true)
    expect(last().doc!.meta.title).toBe('Complex Family Sample')
    expect((await library.list()).map(d => d.id).sort()).toEqual([a, 'doc2'])

    await session.open(a)
    expect(last()).toMatchObject({ docId: a, canUndo: false })
    expect(last().doc!.meta.title).toBe('A')
  })

  it('reports import problems without changing the open document', async () => {
    const { session, last } = setup()
    await session.create('Keep me', subject)
    const r = await session.importText('{ not json')
    expect(r.ok).toBe(false)
    expect((await session.importText('{"foo": 1}')).ok).toBe(false)
    expect(last().doc!.meta.title).toBe('Keep me')
  })

  it('round-trips through export/import', async () => {
    const { session, last } = setup()
    await session.importText(JSON.stringify(example))
    const exported = exportGenogram(last().doc!)
    await session.importText(exported)
    const { updated: _a, ...metaA } = JSON.parse(exported).meta
    const { updated: _b, ...metaB } = last().doc!.meta
    expect(metaB).toEqual(metaA)
    expect(last().doc!.persons).toEqual(JSON.parse(exported).persons)
  })
})

describe('DocLibrary on IndexedDB', () => {
  it('saves, lists newest first, duplicates and deletes', async () => {
    const lib = new DocLibrary(indexedDbKeyValue('test-db', 'docs'))
    const session = new Session(lib, { debounceMs: 0, newId: () => 'one' })
    await session.create('First', subject)
    await session.close()
    await lib.duplicate('one', 'two', new Date('2099-01-01'))
    const list = await lib.list()
    expect(list.map(d => [d.id, d.title])).toEqual([
      ['two', 'First (copy)'],
      ['one', 'First'],
    ])
    await lib.remove('one')
    expect((await lib.list()).map(d => d.id)).toEqual(['two'])
  })
})

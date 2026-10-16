import { importGenogram } from '../io/json'
import { createGenogram } from '../model/factory'
import type { Genogram, Id } from '../model/types'
import type { ValidationResult } from '../model/validate'
import { addPerson, type NewPerson, type Result } from './commands'
import { History } from './history'
import type { DocLibrary } from './persistence'

export type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

export interface SessionState {
  docId: string | null
  doc: Genogram | null
  canUndo: boolean
  canRedo: boolean
  /** When off, nothing is written to the device until `save()` is called. */
  autosave: boolean
  saveStatus: SaveStatus
  saveError?: string
}

export interface SessionOptions {
  autosave?: boolean
  debounceMs?: number
  newId?: () => string
}

/**
 * The open genogram: applies commands, tracks undo/redo, and saves to the
 * device library. Framework-free; the UI subscribes to state changes.
 */
export class Session {
  private history: History<Genogram> | null = null
  private docId: string | null = null
  private listeners = new Set<(s: SessionState) => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private saving: Promise<void> = Promise.resolve()
  private autosave: boolean
  private saveStatus: SaveStatus = 'idle'
  private saveError: string | undefined
  private readonly debounceMs: number
  private readonly newId: () => string

  constructor(
    private library: DocLibrary,
    opts: SessionOptions = {},
  ) {
    this.autosave = opts.autosave ?? true
    this.debounceMs = opts.debounceMs ?? 500
    this.newId = opts.newId ?? (() => crypto.randomUUID())
  }

  get state(): SessionState {
    return {
      docId: this.docId,
      doc: this.history?.current ?? null,
      canUndo: this.history?.canUndo ?? false,
      canRedo: this.history?.canRedo ?? false,
      autosave: this.autosave,
      saveStatus: this.saveStatus,
      ...(this.saveError && { saveError: this.saveError }),
    }
  }

  subscribe(fn: (s: SessionState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    const s = this.state
    for (const fn of this.listeners) fn(s)
  }

  // ── documents ──────────────────────────────────────────────────────────────

  /** Start a new genogram around its primary subject. */
  async create(title: string, subject: NewPerson): Promise<string> {
    await this.close()
    const { g } = addPerson(createGenogram(title), { ...subject, isIndexPerson: true })
    return this.start(this.newId(), g)
  }

  async open(id: string): Promise<void> {
    await this.close()
    const g = await this.library.load(id)
    if (!g) throw new Error('Genogram not found.')
    this.history = new History(g)
    this.docId = id
    this.saveStatus = 'saved'
    this.emit()
  }

  /** Import a file as a new genogram. On success it becomes the open document. */
  async importText(text: string, fallbackTitle = ''): Promise<ValidationResult> {
    const result = importGenogram(text, fallbackTitle)
    if (result.ok) {
      await this.close()
      await this.start(this.newId(), result.genogram)
    }
    return result
  }

  async close(): Promise<void> {
    await this.flush()
    this.history = null
    this.docId = null
    this.saveStatus = 'idle'
    this.saveError = undefined
    this.emit()
  }

  private async start(id: string, g: Genogram): Promise<string> {
    this.history = new History(g)
    this.docId = id
    this.saveStatus = 'idle'
    this.emit()
    if (this.autosave) await this.save()
    return id
  }

  // ── editing ────────────────────────────────────────────────────────────────

  /**
   * Apply a command. Throws CommandError (with a user-facing message) if the
   * edit isn't allowed; the document is unchanged in that case.
   * Pass `coalesce` for rapid edits of one field (typing) to merge undo steps.
   */
  apply(command: (g: Genogram) => Result, coalesce?: string): Id | undefined {
    if (!this.history) throw new Error('No genogram is open.')
    const { g, id } = command(this.history.current)
    this.history.push(g, coalesce)
    this.changed()
    return id
  }

  undo(): void {
    if (this.history?.undo() !== undefined) this.changed()
  }

  redo(): void {
    if (this.history?.redo() !== undefined) this.changed()
  }

  private changed() {
    this.saveStatus = this.autosave ? 'pending' : 'idle'
    this.emit()
    if (this.autosave) this.scheduleSave()
  }

  // ── saving ─────────────────────────────────────────────────────────────────

  setAutosave(on: boolean): void {
    this.autosave = on
    this.emit()
    if (on && this.history) this.scheduleSave()
  }

  private scheduleSave() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(), this.debounceMs)
  }

  /** Save the open genogram now. */
  async save(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.history || !this.docId) return
    const id = this.docId
    const g = this.history.current
    this.saving = this.saving.then(async () => {
      try {
        await this.library.save(id, g)
        if (this.docId === id && this.history?.current === g) this.saveStatus = 'saved'
        this.saveError = undefined
      } catch (e) {
        this.saveStatus = 'error'
        this.saveError = (e as Error).message
      }
      this.emit()
    })
    await this.saving
  }

  /** Finish any pending autosave (e.g. before closing or switching documents). */
  async flush(): Promise<void> {
    if (this.timer !== undefined && this.autosave) await this.save()
    await this.saving
  }
}

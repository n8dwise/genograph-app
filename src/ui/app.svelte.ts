import { exportGenogram } from '../io/json'
import { CommandError, type Result } from '../store/commands'
import { DocLibrary, type DocSummary } from '../store/persistence'
import { Session, type SessionState } from '../store/session'
import type { Genogram, Id } from '../model/types'
import type { Selection } from '../render/selection'

// App-wide reactive state: wraps the framework-free Session for Svelte,
// plus routing, selection and toasts.

export type Route = { name: 'home' } | { name: 'doc'; id: string }

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
}

const AUTOSAVE_PREF = 'genograph:autosave'

function parseHash(hash: string): Route {
  const m = /^#\/g\/([\w-]+)$/.exec(hash)
  return m ? { name: 'doc', id: m[1] } : { name: 'home' }
}

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
  } catch {
    return fallback
  }
}

export class AppState {
  readonly session: Session
  s = $state<SessionState>() as SessionState
  docs = $state<DocSummary[]>([])
  docsLoaded = $state(false)
  route = $state<Route>({ name: 'home' })
  selected = $state<Selection | null>(null)
  toasts = $state<Toast[]>([])
  private toastSeq = 0

  constructor(readonly library: DocLibrary) {
    this.session = new Session(library, { autosave: readPref(AUTOSAVE_PREF, true) })
    this.session.subscribe(s => (this.s = s))
    this.route = parseHash(location.hash)
    window.addEventListener('hashchange', () => (this.route = parseHash(location.hash)))
  }

  get doc(): Genogram | null {
    return this.s.doc
  }

  // ── navigation ─────────────────────────────────────────────────────────────

  go(route: Route) {
    location.hash = route.name === 'doc' ? `#/g/${route.id}` : '#/'
  }

  async refreshDocs() {
    this.docs = await this.library.list()
    this.docsLoaded = true
  }

  // ── editing ────────────────────────────────────────────────────────────────

  /** Apply a command; refused edits become a toast instead of an exception. */
  apply(command: (g: Genogram) => Result, coalesce?: string): Id | undefined {
    try {
      return this.session.apply(command, coalesce)
    } catch (e) {
      if (e instanceof CommandError) {
        this.toast(e.message, 'error')
        return undefined
      }
      throw e
    }
  }

  undo() {
    this.session.undo()
  }

  redo() {
    this.session.redo()
  }

  setAutosave(on: boolean) {
    try {
      localStorage.setItem(AUTOSAVE_PREF, String(on))
    } catch {
      // Preference just won't persist.
    }
    this.session.setAutosave(on)
  }

  // ── files ──────────────────────────────────────────────────────────────────

  async importFile(file: File): Promise<void> {
    const text = await file.text()
    const result = await this.session.importText(text, file.name.replace(/\.json$/i, ''))
    if (!result.ok) {
      this.toast(`Couldn’t open “${file.name}”: ${result.errors.slice(0, 2).join(' ')}`, 'error')
      return
    }
    if (result.warnings.length) this.toast(result.warnings.join(' '), 'info')
    await this.refreshDocs()
    this.go({ name: 'doc', id: this.s.docId! })
  }

  exportFile() {
    const g = this.doc
    if (!g) return
    const blob = new Blob([exportGenogram(g)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(g.meta.title || 'genogram').replace(/[\\/:*?"<>|]+/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // ── toasts ─────────────────────────────────────────────────────────────────

  toast(message: string, kind: Toast['kind'] = 'info') {
    const id = ++this.toastSeq
    this.toasts = [...this.toasts, { id, message, kind }]
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 4000)
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter(t => t.id !== id)
  }
}

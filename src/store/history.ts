/**
 * Undo/redo over immutable snapshots.
 *
 * Edits sharing a `coalesce` key within `coalesceMs` replace the previous step
 * instead of adding one, so typing a name is a single undo, not one per key.
 */
export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private lastKey: string | undefined
  private lastAt = 0

  constructor(
    private present: T,
    private limit = 100,
    private coalesceMs = 1000,
  ) {}

  get current(): T {
    return this.present
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  push(next: T, coalesce?: string, now = Date.now()): void {
    const merge = coalesce !== undefined && coalesce === this.lastKey && now - this.lastAt < this.coalesceMs
    if (!merge) {
      this.past.push(this.present)
      if (this.past.length > this.limit) this.past.shift()
    }
    this.present = next
    this.future = []
    this.lastKey = coalesce
    this.lastAt = now
  }

  undo(): T | undefined {
    const prev = this.past.pop()
    if (prev === undefined) return undefined
    this.future.push(this.present)
    this.present = prev
    this.lastKey = undefined
    return prev
  }

  redo(): T | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(this.present)
    this.present = next
    this.lastKey = undefined
    return next
  }
}

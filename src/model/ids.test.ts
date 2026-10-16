import { describe, expect, it } from 'vitest'
import { nextId } from './ids'

describe('nextId', () => {
  it('starts at 1 when empty', () => {
    expect(nextId([], 'p')).toBe('p1')
  })

  it('uses max + 1, not count + 1', () => {
    expect(nextId(['p1', 'p4', 'p2'], 'p')).toBe('p5')
  })

  it('ignores other prefixes and non-numeric ids', () => {
    expect(nextId(['f9', 'p2', 'pX', 'pp3'], 'p')).toBe('p3')
  })
})

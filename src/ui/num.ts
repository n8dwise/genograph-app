/** Parse an optional whole-number input: '' or junk → undefined. */
export function parseOptInt(s: string | number | undefined | null): number | undefined {
  if (s === undefined || s === null) return undefined
  const n = typeof s === 'number' ? s : parseInt(String(s).trim(), 10)
  return Number.isFinite(n) ? n : undefined
}

export const optStr = (n: number | undefined) => (n === undefined ? '' : String(n))

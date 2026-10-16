import { detectFormat, migratePersonList, migrateV1, type DemoPerson, type V1Data } from '../model/migrate'
import type { Genogram } from '../model/types'
import { validateGenogram, type ValidationResult } from '../model/validate'

/**
 * Parse a genogram file in any supported format (v2, v1 app, JointJS person list),
 * converting old formats and validating the result.
 * Migration notes come back as warnings alongside validation warnings.
 */
export function importGenogram(text: string, fallbackTitle = ''): ValidationResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [`This isn’t valid JSON: ${(e as Error).message}`] }
  }

  const format = detectFormat(json)
  let candidate: unknown = json
  let migrationWarnings: string[] = []
  try {
    if (format === 'v1') {
      const r = migrateV1(json as V1Data)
      candidate = r.genogram
      migrationWarnings = r.warnings
    } else if (format === 'person-list') {
      const r = migratePersonList(json as DemoPerson[], fallbackTitle)
      candidate = r.genogram
      migrationWarnings = r.warnings
    } else if (format === 'unknown') {
      return { ok: false, errors: ['This file doesn’t look like a genogram (expected a Genograph JSON file).'] }
    }
  } catch (e) {
    return { ok: false, errors: [`Couldn’t convert this older file: ${(e as Error).message}`] }
  }

  const result = validateGenogram(candidate)
  if (!result.ok) return result
  if (!result.genogram.meta.title && fallbackTitle) result.genogram.meta.title = fallbackTitle
  return { ...result, warnings: [...migrationWarnings, ...result.warnings] }
}

export function exportGenogram(g: Genogram): string {
  return JSON.stringify(g, null, 2)
}

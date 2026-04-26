import { communityEntrySchema, type CommunityEntry } from './schemas.js'

export interface ValidationIssue {
  file: string
  path: string
  message: string
}

export interface ValidationResult {
  entries: Array<{ file: string; entry: CommunityEntry }>
  issues: ValidationIssue[]
}

export interface FileInput {
  file: string
  content: string
}

export function canonicalPairKey(rxcui1: string, rxcui2: string): string {
  return rxcui1 < rxcui2 ? `${rxcui1}-${rxcui2}` : `${rxcui2}-${rxcui1}`
}

export function expectedFilename(entry: CommunityEntry): string {
  return `${canonicalPairKey(entry.drug1.rxcui, entry.drug2.rxcui)}.json`
}

export function validateFiles(inputs: FileInput[]): ValidationResult {
  const issues: ValidationIssue[] = []
  const entries: Array<{ file: string; entry: CommunityEntry }> = []
  const seenPairKeys = new Map<string, string>()

  for (const { file, content } of inputs) {
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch (err) {
      issues.push({
        file,
        path: '$',
        message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }

    const parsed = communityEntrySchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          file,
          path: issue.path.length > 0 ? issue.path.join('.') : '$',
          message: issue.message,
        })
      }
      continue
    }

    const entry = parsed.data
    const expected = expectedFilename(entry)
    const filenameOk = file.endsWith(`/${expected}`) || file === expected
    if (!filenameOk) {
      issues.push({
        file,
        path: '$',
        message: `filename must be "${expected}" (canonical form: lower rxcui first)`,
      })
    }

    const pairKey = canonicalPairKey(entry.drug1.rxcui, entry.drug2.rxcui)
    const existingFile = seenPairKeys.get(pairKey)
    if (existingFile !== undefined) {
      issues.push({
        file,
        path: '$',
        message: `duplicate pair with ${existingFile} (rxcui pair ${pairKey})`,
      })
      continue
    }
    seenPairKeys.set(pairKey, file)

    if (!filenameOk) continue

    entries.push({ file, entry })
  }

  return { entries, issues }
}

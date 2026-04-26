import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateFiles } from '../validate.js'

function collectJsonFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) continue
    if (!name.endsWith('.json')) continue
    files.push(full)
  }
  return files.sort()
}

function main(): void {
  const pairsDir = resolve(
    new URL('.', import.meta.url).pathname,
    '../pairs',
  )

  const absolutePaths = collectJsonFiles(pairsDir)
  const inputs = absolutePaths.map((abs) => ({
    file: abs.slice(pairsDir.length + 1),
    content: readFileSync(abs, 'utf-8'),
  }))

  const { entries, issues } = validateFiles(inputs)

  if (issues.length > 0) {
    console.error(`\nFAIL: ${issues.length} validation issue(s) across ${inputs.length} file(s):\n`)
    for (const issue of issues) {
      console.error(`  ${issue.file} [${issue.path}]: ${issue.message}`)
    }
    process.exit(1)
  }

  console.log(`OK: validated ${entries.length} community pair(s) across ${inputs.length} file(s)`)
}

main()

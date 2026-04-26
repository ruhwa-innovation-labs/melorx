import { createDb, type Db } from '@melorx/core'

export function requireDb(): Db {
  const url = process.env['DATABASE_URL']
  if (!url) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }
  return createDb(url)
}

export function exitWithError(message: string, code = 1): never {
  console.error(`ERROR: ${message}`)
  process.exit(code)
}

export function printHelp(): void {
  console.log(`melorx — command-line interface

Usage: melorx <command> [subcommand] [flags]

Commands:
  review list [--status <s>] [--severity <s>] [--limit N]
     List review-queue rows. Default: pending, sorted by confidence DESC.

  review approve <id>
     Mark a review-queue row as approved. Run 'promote' to materialise into
     drug_interaction.

  review reject <id> --reason "<text>"
     Mark a review-queue row as rejected with a required reason.

  promote
     Move eligible review-queue rows (confidence >= 0.75) into drug_interaction.
     Fails if any sub-0.75 row has leaked into drug_interaction (Rule #6).

  ingest partition <path-to-openfda-partition.json>
     Ingest a local OpenFDA partition JSON file through the extractor.

  ingest all [--max-partitions N] [--force] [--dry-run]
     Fetch the OpenFDA download.json index and ingest every partition whose
     checksum differs from the last-ingested state.

Flags that apply to any command:
  --help, -h        Show this help and exit.
`)
}

#!/usr/bin/env tsx
import { parseArgs } from 'node:util'
import { logger } from '@melorx/core'
import {
  approveCommand,
  listCommand,
  rejectCommand,
  type ReviewListArgs,
} from './commands/review.js'
import { promoteCommand } from './commands/promote.js'
import {
  ingestAllCommand,
  ingestPartitionCommand,
  type IngestAllArgs,
} from './commands/ingest.js'
import { printHelp } from './util.js'

async function main(): Promise<void> {
  const [, , command, subcommand, ...rest] = process.argv

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp()
    return
  }

  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      severity: { type: 'string' },
      status: { type: 'string' },
      limit: { type: 'string' },
      reason: { type: 'string' },
      'max-partitions': { type: 'string' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  })

  if (values['help']) {
    printHelp()
    return
  }

  try {
    switch (command) {
      case 'review':
        await handleReview(subcommand, values, positionals)
        break
      case 'promote':
        await promoteCommand()
        break
      case 'ingest':
        await handleIngest(subcommand, values, positionals)
        break
      default:
        console.error(`unknown command: "${command}"`)
        printHelp()
        process.exit(1)
    }
  } catch (err) {
    logger.error({ err }, `command "${command}" failed`)
    process.exit(1)
  }
}

async function handleReview(
  subcommand: string | undefined,
  values: Record<string, unknown>,
  positionals: string[],
): Promise<void> {
  switch (subcommand) {
    case 'list':
      await listCommand(values as ReviewListArgs)
      break
    case 'approve':
      await approveCommand(positionals[0] ?? '')
      break
    case 'reject':
      await rejectCommand(positionals[0] ?? '', (values['reason'] as string) ?? '')
      break
    default:
      console.error(`unknown review subcommand: "${subcommand ?? ''}"`)
      console.error('usage: melorx review (list|approve|reject) ...')
      process.exit(1)
  }
}

async function handleIngest(
  subcommand: string | undefined,
  values: Record<string, unknown>,
  positionals: string[],
): Promise<void> {
  switch (subcommand) {
    case 'partition':
      await ingestPartitionCommand(positionals[0] ?? '')
      break
    case 'all':
      await ingestAllCommand(values as IngestAllArgs)
      break
    default:
      console.error(`unknown ingest subcommand: "${subcommand ?? ''}"`)
      console.error('usage: melorx ingest (partition <path>|all [--max-partitions N])')
      process.exit(1)
  }
}

main().catch((err) => {
  logger.error({ err }, 'cli failed')
  process.exit(1)
})

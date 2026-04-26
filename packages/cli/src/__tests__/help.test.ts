import { describe, expect, it, vi } from 'vitest'
import { printHelp } from '../util.js'

describe('printHelp', () => {
  it('prints a non-empty usage message with every command listed', () => {
    const out: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      out.push(msg)
    })
    try {
      printHelp()
    } finally {
      spy.mockRestore()
    }

    const joined = out.join('\n')
    expect(joined.length).toBeGreaterThan(100)
    for (const command of ['review list', 'review approve', 'review reject', 'promote', 'ingest partition', 'ingest all']) {
      expect(joined).toContain(command)
    }
  })
})

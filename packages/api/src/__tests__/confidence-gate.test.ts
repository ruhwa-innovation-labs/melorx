import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, isNotNull, or } from 'drizzle-orm'
import { createDb, drugConcept, drugInteraction } from '@melorx/core'
import { createApp } from '../app.js'

/**
 * Rule #6 integration test: `drug_interaction` rows with confidence < 0.75
 * MUST NOT be served by the API. This test exercises the read gate in
 * packages/api/src/services/interaction.service.ts end-to-end.
 *
 * Requires a running Postgres with at least the ONCHigh seed (acetaminophen
 * 161 and caffeine 1886 are both present because both appear as RxNorm
 * ingredients pulled in by identifier enrichment).
 */
describe('Rule #6: confidence < 0.75 read-gate', () => {
  const db = createDb(process.env['DATABASE_URL']!)
  const app = createApp(db)

  // Use a pair that is NOT covered by curated ONCHigh pairs or class rules,
  // so the only rows the API could possibly return for this pair are the
  // synthetic rows this test inserts.
  const DRUG_A = '161' // acetaminophen
  const DRUG_B = '1886' // caffeine

  const inserted: string[] = []

  async function ensureConcepts(): Promise<void> {
    for (const [rxcui, name] of [[DRUG_A, 'acetaminophen'], [DRUG_B, 'caffeine']] as const) {
      await db
        .insert(drugConcept)
        .values({
          rxcui,
          name,
          drugClass: [],
          identifiers: { ndc: [], atc: null, drugbank: null, brand_names: [] },
        })
        .onConflictDoNothing()
    }
  }

  async function insertInteraction(confidence: string): Promise<string> {
    const [row] = await db
      .insert(drugInteraction)
      .values({
        drug1Rxcui: DRUG_A,
        drug2Rxcui: DRUG_B,
        severity: 'minor',
        mechanism: `synthetic gate test row (confidence=${confidence})`,
        management: null,
        sources: [
          {
            name: 'test-fixture',
            url: 'https://example.test/gate-test',
            type: 'fda_label',
            accessed_date: '2026-04-22',
          },
        ],
        isGenerated: false,
        confidence,
      })
      .returning({ id: drugInteraction.id })
    if (!row) throw new Error('failed to insert gate-test row')
    inserted.push(row.id)
    return row.id
  }

  async function clearPair(): Promise<void> {
    await db
      .delete(drugInteraction)
      .where(
        and(
          isNotNull(drugInteraction.confidence),
          or(
            and(
              eq(drugInteraction.drug1Rxcui, DRUG_A),
              eq(drugInteraction.drug2Rxcui, DRUG_B),
            ),
            and(
              eq(drugInteraction.drug1Rxcui, DRUG_B),
              eq(drugInteraction.drug2Rxcui, DRUG_A),
            ),
          ),
        ),
      )
  }

  beforeAll(async () => {
    await ensureConcepts()
    await clearPair()
  })

  afterEach(async () => {
    await clearPair()
  })

  it('filters out a row with confidence = 0.50', async () => {
    await insertInteraction('0.50')
    const res = await app.request(`/v1/interactions?drug1=${DRUG_A}&drug2=${DRUG_B}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { interactions: unknown[] } }
    expect(body.data.interactions).toHaveLength(0)
  })

  it('filters out a row with confidence = 0.74 (just below threshold)', async () => {
    await insertInteraction('0.74')
    const res = await app.request(`/v1/interactions?drug1=${DRUG_A}&drug2=${DRUG_B}`)
    const body = await res.json() as { data: { interactions: unknown[] } }
    expect(body.data.interactions).toHaveLength(0)
  })

  it('serves a row with confidence = 0.75 (at threshold)', async () => {
    await insertInteraction('0.75')
    const res = await app.request(`/v1/interactions?drug1=${DRUG_A}&drug2=${DRUG_B}`)
    const body = await res.json() as {
      data: { interactions: Array<{ confidence: number | null }> }
    }
    expect(body.data.interactions).toHaveLength(1)
    expect(body.data.interactions[0]?.confidence).toBe(0.75)
  })

  it('serves a row with confidence = 0.95 (well above threshold)', async () => {
    await insertInteraction('0.95')
    const res = await app.request(`/v1/interactions?drug1=${DRUG_A}&drug2=${DRUG_B}`)
    const body = await res.json() as {
      data: { interactions: Array<{ confidence: number | null }> }
    }
    expect(body.data.interactions).toHaveLength(1)
    expect(body.data.interactions[0]?.confidence).toBe(0.95)
  })

  it('applies the gate symmetrically regardless of drug order', async () => {
    await insertInteraction('0.50')
    const res1 = await app.request(`/v1/interactions?drug1=${DRUG_A}&drug2=${DRUG_B}`)
    const res2 = await app.request(`/v1/interactions?drug1=${DRUG_B}&drug2=${DRUG_A}`)
    const b1 = await res1.json() as { data: { interactions: unknown[] } }
    const b2 = await res2.json() as { data: { interactions: unknown[] } }
    expect(b1.data.interactions).toHaveLength(0)
    expect(b2.data.interactions).toHaveLength(0)
  })

  it('still serves curated rows (confidence = NULL) alongside filtered NLP rows', async () => {
    // Use a pair that already has a curated row: simvastatin (36567) + amiodarone (703).
    const res = await app.request('/v1/interactions?drug1=36567&drug2=703')
    const body = await res.json() as {
      data: { interactions: Array<{ confidence: number | null; severity: string }> }
    }
    expect(body.data.interactions.length).toBeGreaterThan(0)
    expect(body.data.interactions[0]?.confidence).toBeNull()
    expect(body.data.interactions[0]?.severity).toBe('contraindicated')
  })
})

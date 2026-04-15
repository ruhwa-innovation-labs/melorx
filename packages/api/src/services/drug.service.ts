import { eq, ilike } from 'drizzle-orm'
import { drugConcept, type Db } from '@melo-rx/core'

export async function resolveDrug(db: Db, query: string) {
  const [byCui] = await db
    .select()
    .from(drugConcept)
    .where(eq(drugConcept.rxcui, query))
    .limit(1)

  if (byCui) return byCui

  const [byName] = await db
    .select()
    .from(drugConcept)
    .where(ilike(drugConcept.name, query))
    .limit(1)

  return byName ?? null
}

export async function getDrugByCui(db: Db, rxcui: string) {
  const [drug] = await db
    .select()
    .from(drugConcept)
    .where(eq(drugConcept.rxcui, rxcui))
    .limit(1)

  return drug ?? null
}

/**
 * Guards against silent drift between @melorx/core types and the standalone
 * copies in @melorx/client. If core evolves, this test fails at typecheck time.
 */
import { describe, it, expect } from 'vitest'
import {
  SEVERITY_VALUES as CORE_SEVERITY_VALUES,
  SOURCE_TYPES as CORE_SOURCE_TYPES,
  type DrugConcept as CoreDrugConcept,
  type DrugIdentifiers as CoreDrugIdentifiers,
  type InteractionResult as CoreInteractionResult,
  type InteractionSource as CoreInteractionSource,
  type Severity as CoreSeverity,
  type SourceType as CoreSourceType,
} from '@melorx/core'
import {
  SEVERITY_VALUES,
  SOURCE_TYPES,
  type DrugConcept,
  type DrugIdentifiers,
  type InteractionResult,
  type InteractionSource,
  type Severity,
  type SourceType,
} from '../types.js'

type AssertAssignable<A, B> = A extends B ? (B extends A ? true : false) : false

// Compile-time structural checks — fail typecheck if drift occurs.
const _severityMatches: AssertAssignable<Severity, CoreSeverity> = true
const _sourceTypeMatches: AssertAssignable<SourceType, CoreSourceType> = true
const _drugIdentifiersMatches: AssertAssignable<DrugIdentifiers, CoreDrugIdentifiers> = true
const _drugConceptMatches: AssertAssignable<DrugConcept, CoreDrugConcept> = true
const _interactionSourceMatches: AssertAssignable<InteractionSource, CoreInteractionSource> = true
const _interactionResultMatches: AssertAssignable<InteractionResult, CoreInteractionResult> = true
void _severityMatches
void _sourceTypeMatches
void _drugIdentifiersMatches
void _drugConceptMatches
void _interactionSourceMatches
void _interactionResultMatches

describe('core-compat', () => {
  it('SEVERITY_VALUES matches @melorx/core exactly', () => {
    expect([...SEVERITY_VALUES]).toEqual([...CORE_SEVERITY_VALUES])
  })

  it('SOURCE_TYPES matches @melorx/core exactly', () => {
    expect([...SOURCE_TYPES]).toEqual([...CORE_SOURCE_TYPES])
  })
})

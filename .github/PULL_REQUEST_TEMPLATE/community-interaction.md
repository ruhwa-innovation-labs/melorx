<!--
Use this template when contributing one or more drug–drug interaction pairs
to the melorx community dataset.

Put each pair in its own file under `pipeline/sources/community/pairs/`
named with canonical form: `<lower-rxcui>-<higher-rxcui>.json`
(e.g. `11289-4450.json` for warfarin + fluconazole).

See `pipeline/sources/community/schemas.ts` for the authoritative schema.
-->

## Summary

<!-- 1-2 sentences: which pair(s) and why. -->

## Pair(s) added

<!-- List each new pair by generic name + rxcui pair. Example:
- warfarin (11289) + fluconazole (4450) — serious
-->

## Evidence provided per source entry

- [ ] At least one `sources[]` entry on every new pair
- [ ] Each source cites one of: `clinical_guideline`, `fda_label`, `peer_reviewed_study`, `clinical_pharmacist_review`
- [ ] Each `url` points to a publicly accessible document (no paywalls that require login)
- [ ] `accessed_date` is ISO-8601 (`YYYY-MM-DD`) and reflects when the citation was verified

## Severity classification

- [ ] Severity value is one of: `contraindicated`, `serious`, `moderate`, `minor`, `monitor`
- [ ] The severity aligns with how the cited source characterises the interaction (no upgrading from `moderate` to `serious` without documentary support)

## Clinical review attestation

<!--
Tick the box that applies. Only the top box qualifies a pair for automatic
promotion; the others route the pair through maintainer review before it
reaches the served API.
-->

- [ ] I am a licensed clinical pharmacist, pharmacologist, or prescriber, and I have reviewed the cited evidence.
- [ ] I am a healthcare developer summarising evidence from authoritative sources; a clinical reviewer is welcome to re-grade severity.
- [ ] I am neither of the above; I am surfacing a citation for a reviewer to validate.

## Filename check

- [ ] Every new file under `pipeline/sources/community/pairs/` is named `<lower-rxcui>-<higher-rxcui>.json`.
- [ ] No duplicate rxcui pair exists elsewhere in `pairs/` (checked via the CI validator locally: `pnpm --filter @melorx/pipeline validate:community`).

## Reviewer notes

<!-- Anything a reviewer should know: unusual phrasing in the source,
     conflicting sources, pair relevance scope, etc. Optional. -->

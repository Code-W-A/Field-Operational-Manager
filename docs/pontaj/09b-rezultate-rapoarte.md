# Etapa 9B - rezultate rapoarte

Stare la 2026-07-14: inchidere tehnica finala.

| ID | Stare | Test |
| --- | --- | --- |
| REP-001 | IMPLEMENTED_PASSING | `reports/hr-kpi.spec.ts` |
| REP-002 | IMPLEMENTED_PASSING | `reports/projection-consistency.spec.ts` |
| REP-003 | IMPLEMENTED_PASSING | `reports/employee-variants.spec.ts` |
| REP-004 | IMPLEMENTED_PASSING | `reports/overtime-filters.spec.ts` |
| REP-005 | IMPLEMENTED_PASSING | `reports/reconciliation.spec.ts` |
| REP-006 | IMPLEMENTED_CHARACTERIZATION | `reports/summary-c1-c7.spec.ts` |
| REP-007 | IMPLEMENTED_PASSING | `reports/overtime-export.spec.ts` |
| REP-008 | CHARACTERIZATION_DEF_UX_NON_BLOCKING | `reports/states.spec.ts` |
| REP-009 | IMPLEMENTED_PASSING | `reports/year-timezone.spec.ts` |

Selectia Reports unificata a trecut 14/14: 12 executii functionale REP (REP-001..008 cate una, REP-009 in patru fuse orare), setup Auth si production-boundary. Nu exista FAIL sau SKIP executabil.

Confirmari: KPI-ul si graficul folosesc minutele efective (`entries` minus pauza), nu `cell.hours` brut. CSV-urile overtime au BOM UTF-8, escape pentru ghilimele si nu scriu in Firebase. Agregarea anuala exclude anii din afara selectiei in cele patru fuse testate. Deschiderea rapoartelor, filtrele, exporturile si agregarea anuala sunt read-only; cleanup-ul final nu a gasit fixture-uri REP-002/REP-004 sau salariatul partial.

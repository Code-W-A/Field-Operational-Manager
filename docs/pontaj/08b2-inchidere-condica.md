# ETAPA 8B.2/8B.3 - inchidere Condica

Ultima executie: 2026-07-13, exclusiv pe emulatorul `demo-fom-pontaj-e2e`.

Executia unificata a fost:

```sh
npx playwright test tests/e2e/pontaj/condica tests/e2e/pontaj/infrastructure/production-boundary.spec.ts --config=playwright.pontaj.config.ts --workers=1
```

Rezultat: **35 passed, 0 failed, 0 skipped**: 1 setup Auth, 33 teste CON pentru cele 22 identificatoare si 1 production-boundary. Nu exista FAIL executabil in Condica.

| Caz | Status final | Fisier / test | Ultima executie | Defect asociat |
| --- | --- | --- | --- | --- |
| CON-001 | IMPLEMENTED_NON_BLOCKING | `read.spec.ts` / ruta-luna | PASS 2026-07-13 | - |
| CON-002 | IMPLEMENTED_NON_BLOCKING | `read.spec.ts` / filtru grid-list | PASS 2026-07-13 | - |
| CON-003 | IMPLEMENTED_NON_BLOCKING | `read.spec.ts` / mod compact | PASS 2026-07-13 | - |
| CON-004 | IMPLEMENTED_NON_BLOCKING | `read.spec.ts` / empty fara scrieri | PASS 2026-07-13 | - |
| CON-005 | IMPLEMENTED_NON_BLOCKING | `summary.spec.ts` / KPI | PASS 2026-07-13 | - |
| CON-006 | IMPLEMENTED_NON_BLOCKING | `summary.spec.ts` / tichete-traseu-C1-C7 | PASS 2026-07-13 | DEF-001 |
| CON-007 | IMPLEMENTED_NON_BLOCKING | `summary.spec.ts` / coduri si partial | PASS 2026-07-13 | - |
| CON-008 | IMPLEMENTED_NON_BLOCKING | `realtime.spec.ts` / two-tab Firestore | PASS 2026-07-13 | - |
| CON-009 | IMPLEMENTED_NON_BLOCKING | `day-dialog.spec.ts` / detaliu zi | PASS 2026-07-13 | DEF-006 |
| CON-010 | IMPLEMENTED_NON_BLOCKING | `day-dialog.spec.ts` / curatare intervale | PASS 2026-07-13 | - |
| CON-011 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / editare interval | PASS 2026-07-13 | - |
| CON-012 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / adaugare multi-zi | PASS 2026-07-13 | DEF-002 |
| CON-013 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / stergere selectiva | PASS 2026-07-13 | - |
| CON-014 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / validare luna | PASS 2026-07-13 | DEF-003 |
| CON-015 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / overlap-adiacent | PASS 2026-07-13 | DEF-005 |
| CON-016 | IMPLEMENTED_NON_BLOCKING | `write.spec.ts` / cross-month | PASS 2026-07-13 | DEF-003 |
| CON-017 | IMPLEMENTED_PASSING; TESTABILITY_BLOCKED_NON_BLOCKING pentru UI fault | `atomicity.spec.ts`, `condica-fault-adapter.ts`, `production-boundary.spec.ts` | PASS 2026-07-13 | - |
| CON-018 | IMPLEMENTED_PASSING | `atomicity.spec.ts`, `write.spec.ts`, `convergence.spec.ts` / operatie N, retry, two-tab | PASS 2026-07-13 | DEF-008 |
| CON-019 | IMPLEMENTED_PASSING | `holidays.spec.ts`, `convergence.spec.ts` / mutex, snapshot, restore, two-tab | PASS 2026-07-13 | - |
| CON-020 | IMPLEMENTED_PASSING | `approved-request.spec.ts`, `convergence.spec.ts` / fault, retry, clear, two-tab | PASS 2026-07-13 | DEF-007 |
| CON-021 | IMPLEMENTED_PASSING | `dialog-a11y.spec.ts` / a11y si responsive | PASS 2026-07-13 | TEST_BUG corectat in test |
| CON-022 | IMPLEMENTED_NON_BLOCKING | `export.spec.ts` / CSV | PASS 2026-07-13 | - |

## 8B.3 - inchideri

- CON-017: contractul este demonstrat cu adapter test-only, inainte de commit. Markerul nu apare in `.next`; production-boundary este verde. Nu exista fault injection prin UI real deoarece ar cere hook de productie interzis. Acesta este un gap de testabilitate, nu un defect al aplicatiei.
- CON-018: operatia N pe mai multe zile esueaza determinist inainte de commit, pastreaza zilele necerute, retry-ul este idempotent si doua taburi converg dupa refresh.
- CON-019: suita ruleaza serial pentru singletonul `hrHolidays/{year}`, face snapshot complet, restaureaza in `finally` si compara deep equality, inclusiv Timestamp-uri. Save-ul, editarea, stergerea, sortarea, metadata si propagarea in al doilea tab sunt executate.
- CON-020: conflictul real la update este refuzat cu dialog recuperabil si retry. Eroarea de resync este caracterizata prin adapter test-only: request-ul si auditul raman comise, timesheet-ul ramane vechi pana la retry, fara proiectii duplicate. Nu este revendicata atomicitate pe care implementarea nu o are.
- CON-021: testele folosesc role/nume accesibile, focus, Tab, Shift+Tab, Escape, backdrop, bounding boxes si viewport-uri desktop, mobil portrait si landscape. `Curata intervale` este actiune de popover, nu dialog; este verificata de CON-010, nu declarata artificial ca dialog.

## Siguranta

- Toate scrierile au avut proiectul demo de emulatoare; guardul a refuzat explicit proiectul Firebase live.
- Cleanup-ul a fost rulat de doua ori si a raportat `{"cleanupRuns":2,"remaining":{}}`.
- Nu s-a facut deploy si nu s-a folosit Firebase live.

Verdictul final este in `08b3-verdict-final-condica.md`.

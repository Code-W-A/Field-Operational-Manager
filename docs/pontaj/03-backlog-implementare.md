# Etapa 4 - Backlog executabil pentru suita Playwright Pontaj

Acest backlog nu implementeaza teste. Fiecare task este atomic, are dependente si definition of done. Numele de fisiere sunt tinte recomandate pentru Etapa 5.

## Valul 0 - Safety si emulator

Model: infrastructura fail-closed, proiect emulator dedicat per run.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W0-01 configureaza Auth si Storage Emulator | none | `firebase.json` | GATE-01 | health pentru 4 servicii |
| W0-02 conecteaza browserul explicit la emulatoare | W0-01 | `lib/firebase/config.ts`, helper env | toate EMU | niciun SDK nu foloseste endpoint implicit |
| W0-03 creeaza guard project/host fail-closed | W0-02 | `tests/e2e/pontaj/global-safety.ts` | GATE-02/03 | proiect live refuzat de test canary |
| W0-04 defineste runId si manifest persistent | W0-03 | `tests/e2e/fixtures/run-manifest.ts` | toate mutatiile | resursa este in manifest inainte/dupa create |
| W0-05 implementeaza cleanup si recovery janitor | W0-04 | `tests/e2e/fixtures/cleanup.ts` | Auth/FS/Storage/logs/works | GATE-04 trece inclusiv dupa proces intrerupt |
| W0-06 dezactiveaza seed in test | W0-02 | `lib/hr/storage.ts`, env test | HOOK-20/GATE-10 | baza goala ramane goala la open |
| W0-07 izoleaza SMTP si servicii externe | W0-01 | Functions test env/stubs | request triggers | zero trafic extern neasteptat |

Criteriu val: GATE-01..04, 08 si 10 trec; un run canary nu lasa resurse.

## Valul 1 - Inspectori, identitati, selectori, clock

Model: fixtures typed, Page Object subtire, inspectare independenta de UI.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W1-01 Admin SDK emulator helper | W0 | `tests/e2e/fixtures/firebase-admin.ts` | seed/inspect/cleanup | foloseste emulator env si project demo |
| W1-02 Web SDK security helper | W0 | `tests/e2e/fixtures/firebase-client.ts` | RES-005/006 | actiunea Rules nu foloseste Admin |
| W1-03 storage states pentru toate rolurile | W1-01 | `tests/e2e/auth.setup.ts` | RT-011..020 | GATE-05 trece |
| W1-04 fixtures typed globale/worker/test | W1-01 | `tests/e2e/fixtures/pontaj.ts` | EMP/ATT/DAY/REQ/HOL/WORK | toate ID-urile au create/cleanup |
| W1-05 fault fixtures lipsa | W1-01 | `tests/e2e/fixtures/faults.ts` | cele 9 contracte lipsa | fiecare fault are scope si reset |
| W1-06 selectori critici | W0 | componentele pentru HOOK-01/02/04/05/14 | CON/REP/CAL | selector unic demonstrat desktop/mobile |
| W1-07 clock browser si Functions core | W0 | helper clock + core handlers | HOOK-16 | GATE-06 trece fara timeout real |

Criteriu val: GATE-05/06/12/14 trec; fixture canary round-trip este zero-leak.

## Valul 2 - Oracole numerice

Model: table-driven, fara UI complet, oracle independent de helperul aplicatiei.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W2-01 parser vectori versionat | W1 | `tests/e2e/data/pontaj-vectors.ts` | V01-V85 | 85 ID-uri validate schema |
| W2-02 oracle interval/break/union | W2-01 | `tests/e2e/oracles/time.ts` | V01-V20, V38-V47 | exemplele numerice trec independent |
| W2-03 oracle program/banca/summary | W2-01 | `tests/e2e/oracles/hr-summary.ts` | V21-V36, V73-V85 | individual/default/fallback separate |
| W2-04 oracle UTC/Bucharest/DST | W2-01 | `tests/e2e/oracles/timezone.ts` | V64-V72 | artifact time-oracle complet |
| W2-05 integration projection fara UI | W1/W2 | `tests/e2e/pontaj/calculations/*.spec.ts` | toate CAL, nivel minim | documentele rezultate corespund vectorilor |
| W2-06 tags characterization | W2-05 | metadata test | V54/62/63/65/71/80 | excluse din blocking grep |

Criteriu val: 85/85 oracole raportate individual; niciun characterization nu blocheaza CI.

## Valul 3 - Auth, routes si Rules

Model: proiecte Playwright per rol; UI si Rules testate separat.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W3-01 route access table | W1 | `tests/e2e/pontaj/routes/access.spec.ts` | RT-001..020 | URL/flash/refresh/context nou |
| W3-02 role change/token expiry | W1 | `auth/session.spec.ts` | RT-020 | efect observat dupa refresh/token refresh |
| W3-03 Firestore Rules | W1 | `security/firestore.spec.ts` | RES-005 | rules deschise produc failure-defect explicit |
| W3-04 Storage Rules | W1 | `security/storage.spec.ts` | RES-006 | fallback OR demonstrat ca defect |

Criteriu val: redirectul nu este folosit ca dovada Rules; defectele SEC sunt vizibile.

## Valul 4 - START, STOP si lock

Model: state-machine integration plus E2E UI reprezentativ.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W4-01 START identity/schedule/protected | W1/W2/W3 | `start/*.spec.ts` | STA-001..011, V21..24/48..52 | before/after complet |
| W4-02 START lock/race | W1 | `locks/start.spec.ts` | STA-017..019, V53..55 | invariant, fara winner nominal |
| W4-03 STOP state/minimum/clamp | W1/W2 | `stop/*.spec.ts` | STO-001..012/016/017, V56..58/64/70 | clock determinist, lock corect |
| W4-04 field media/GPS | W1 | `field/media-location.spec.ts` | STA-013..016, STO-010/011 | imagini sintetice, HTTP mock |
| W4-05 defect contract lock cron | W1 | characterization integration | DEF-LOCK-001 | testul esueaza daca stale dispare fara actualizare oracle |

Criteriu val: state machine curenta este demonstrata; STA-004 ramane fixme business.

## Valul 5 - Sync client, Functions si cron

Model: aceeasi matrice de intrare rulata prin doua adaptoare, comparare structurala.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W5-01 sync client | W2/W4 | `sync/client.spec.ts` | SYN-001/003..005/008..012/014 | idempotency si protected codes |
| W5-02 trigger checkout Functions | W0/W1/W2 | `sync/functions.spec.ts` | SYN-002, V41 | GATE-07 si SHA companion |
| W5-03 cron core injectabil | W1-07 | Functions integration | SYN-006, V62/63 | sesiune/timesheet si caracterizarea lock |
| W5-04 sync concurrency | W5-01/02 | `sync/concurrency.spec.ts` | SYN-013 | final cell identic, fara duplicate |
| W5-05 request client vs Functions | W2 | characterization | CHR-011..013 | ambele rezultate capturate, BLK-003 neatins |

Criteriu val: paritatea actuala V40/V41 trece; cron nu asteapta scheduler real.

## Valul 6 - Condica, profil si rapoarte

Model: seed + proiectie UI tintita; nu se repeta toate formulele prin full UI.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W6-01 grid/list/dialog details | W1/W2 | `condica/read.spec.ts` | CON-001..010 | selectori identity-safe |
| W6-02 mutatii zi | W1/W2 | `condica/write.spec.ts` | CON-011..020 | document complet si two-tab converge |
| W6-03 KPI/summary | W2 | `condica/summary.spec.ts` | CON-005..007, V73..85 | V80 data row non-blocking |
| W6-04 profil | W2 | `salariati/profile-timesheet.spec.ts` | proiectii CAL | valori conform helperului curent |
| W6-05 reports | W1/W2 | `reports/*.spec.ts` | REP-001..009 | KPI, chart fallback/tabel, filtre |
| W6-06 cross-page representative | W6-01/04/05 | `projection.spec.ts` | REP-002 subset audit | elapsed/effective explicit |

Criteriu val: fiecare consumator are cel putin un vector normal, overlap, zero, DST si norma individuala.

## Valul 7 - HR, departamente, cereri, exporturi

Model: CRUD UI cu inspectare Firebase si download parsers.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W7-01 employees/defaults | W1 | `salariati/crud.spec.ts` | HR-001..010 | timestamps si singleton restore |
| W7-02 departments | W1 | `departamente.spec.ts` | HR-011/012 | associated/free/cancel/error |
| W7-03 requests | W2/W5 | `requests/*.spec.ts` | HR-014..016 | payload, Storage, timesheet, lifecycle |
| W7-04 exports | W2 | `exports/*.spec.ts` | CON-022, REP-007, DOCX | encoding/header/rows, zero writes |
| W7-05 business blocked catalog | none | annotations | HR-013/BLK-001..006 | nu intra in blocking |

Criteriu val: singleton-urile revin exact; staging accounts precreate nu se sterg.

## Valul 8 - Concurenta, faults, offline si timezone

Model: invariant final E2E; control intern numai la integration.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W8-01 concurrency invariants | W4/W5 | `concurrency/*.spec.ts` | STA-017, STO-009, SYN-013, KSK-012, HR-015 | no nominal winner |
| W8-02 auth commit boundary adapter | W1 | integration adapter | RES-002 | devine testabil sau ramane blocked explicit |
| W8-03 network/offline | W1 | `resilience/*.spec.ts` | RES-001/003/004, STO-013 | fault scope demonstrat |
| W8-04 timezone browser matrix | W1/W2 | `timezone/*.spec.ts` | V64..72, SYN-014, REP-009 | Bucharest/UTC/London/NY artifacts |
| W8-05 accessibility/responsive automated | W6/W7 | `a11y/*.spec.ts` | CON-021, RES-008 companion | focus/labels/no overlap |

Criteriu val: zero timeout arbitrar; fiecare fault este resetat si independent.

## Valul 9 - Staging, live si manual device

Model: contract minimal in medii externe, fara reutilizarea datelor reale.

| Task | Dependente | Fisiere recomandate | Include | Done |
|---|---|---|---|---|
| W9-01 staging SHA/rules/config preflight | W0 | `staging/preflight.ts` | GATE-11 | SHA Vercel/Functions/rules capturate |
| W9-02 staging Functions/Auth/Storage | W3/W5 | `staging/contracts.spec.ts` | SYN-002, RES-006/007 | numai namespace E2E |
| W9-03 live read-only guard | W0 | `live/preflight.ts` | GATE-13 | write interception si seed disabled |
| W9-04 live smoke | W9-03 | `live/routes.spec.ts` | cele 13 LIVE_RO | zero request mutating/PII artifact |
| W9-05 manual device | staging aprobat | checklist | KSK-014, DEV-01..06 | separat de CI blocking |

Criteriu val: GATE-11/13/15 trec; live are zero mutatii; manualul este raportat separat.

## Ordine critica

`W0 -> W1 -> W2 -> W3 -> W4 -> W5 -> W6 -> W7 -> W8 -> W9`.

Exceptii de paralelizare: W3 poate incepe dupa W1; W4 si W6 asteapta oracolele W2; W9 nu incepe pana cand aceeasi regula trece in emulator. Niciun val ulterior nu ocoleste un gate esuat.

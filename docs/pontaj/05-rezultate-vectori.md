# Etapa 6 - Rezultate vectori V01-V85

Data executiei: 2026-07-11. Mediu: Firebase Emulator Suite, proiect `demo-fom-pontaj-e2e`, timezone `Europe/Bucharest`.

## Rezumat

- Registru: 85/85 ID-uri valide, fara duplicate sau lipsuri.
- Playwright complet: 109/109 PASS, incluzand setup, 85 cazuri CAL, 15 proiectii UI, V01 si fluxurile Etapei 5.
- Functions: `onAttendanceCheckoutSync` executat real pentru V41.
- Characterization non-blocking: V54, V62, V63, V65, V71, V80.
- Cleanup: executat de doua ori; resurse ramase `{}`.
- Firebase live: refuzat de guard; toate mutatiile au folosit proiectul `demo-*`.

## Rezultate individuale

| ID | Nivel testat | Rezultat | CI | Timp | Defect asociat | Artefact | Observatii |
|---|---|---|---|---:|---|---|---|
| V01 | oracle + emulator + UI | PASS | blocking | 5.470s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | START 08:00, STOP 16:30 |
| V02 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Interval 08:00-12:00, pauza fara intersectie |
| V03 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Interval 13:00-16:30 |
| V04 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Doua intervale separate |
| V05 | oracle + emulator + UI | PASS | blocking | 0.555s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Intervale Pontaj suprapuse |
| V06 | oracle + emulator + UI | PASS | blocking | 0.529s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Intervale Pontaj duplicate |
| V07 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Intervale manuale suprapuse |
| V08 | oracle + emulator + UI | PASS | blocking | 0.477s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauza manuala suprima pauza implicita |
| V09 | oracle + emulator/justificare | PASS | blocking | 0.016s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauza partial intersectata |
| V10 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauza manuala in afara prezentei |
| V11 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Doua pauze manuale distincte |
| V12 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauze manuale suprapuse |
| V13 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauza manuala invalida revine la default |
| V14 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Pauza manuala valida in afara prezentei suprima default |
| V15 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Prezenta de 20 minute cu intersectie de pauza 10 minute |
| V16 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Prezenta de 30 minute cu intersectie de pauza 20 minute |
| V17 | oracle + emulator + UI | PASS | blocking | 0.530s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Prezenta exact in pauza produce zero ore |
| V18 | oracle + emulator/justificare | PASS | blocking | 0.014s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Ora 24:00 este invalida |
| V19 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Interval HH:mm peste miezul noptii este invalid |
| V20 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/intervals.spec.ts` | Intervale adiacente |
| V21 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Intarziere individuala 17 minute prin floor |
| V22 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Program din defaults |
| V23 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Program fallback hard-coded |
| V24 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Prezenta incepe inainte de program |
| V25 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Plecare la 15:00 |
| V26 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Pauza individuala are precedenta |
| V27 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Pauza compusa prin fallback per camp |
| V28 | oracle + emulator + UI | PASS | blocking | 0.644s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | Cod CO protejat la resync |
| V29 | oracle + emulator/justificare | PASS | blocking | 0.014s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | Cod CFP protejat la resync |
| V30 | oracle + emulator/justificare | PASS | blocking | 0.013s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | Cod CM protejat la resync |
| V31 | oracle + emulator/justificare | PASS | blocking | 0.012s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | Cod IN protejat si sumar cerere 2h |
| V32 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | DEL pastreaza codul si primeste Pontaj |
| V33 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | WE cu interval de 4h |
| V34 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/codes.spec.ts` | SL cu interval de 4h |
| V35 | oracle + emulator + UI | PASS | blocking | 0.502s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | WORK fara entries si fara hours valoreaza zero |
| V36 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | WORK fara entries cu hours=6 |
| V37 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Intrare manuala 08:00-10:00 |
| V38 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Pontaj 10:00-16:00 |
| V39 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Manual 08-10 si Pontaj 10-16 |
| V40 | oracle + emulator + UI | PASS | blocking | 0.487s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Manual si Pontaj suprapuse, sync client |
| V41 | oracle + emulator + UI | PASS | blocking | 2.410s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Paritate Functions pentru manual si Pontaj suprapuse |
| V42 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Resync repetat este idempotent |
| V43 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Resync dupa modificarea sessionEnd |
| V44 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Resync repetat cu sesiuni suprapuse |
| V45 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | Pauzele manuale se pastreaza la sync |
| V46 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | DEL poate pierde metadata whole-day la reconstructie |
| V47 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/manual-pontaj.spec.ts` | CO pastreaza integral metadata la resync |
| V48 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | START creeaza sesiune active si lock |
| V49 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | employeeId rezolvat prin userUid |
| V50 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Fallback legacy pe nume si backfill userUid |
| V51 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Tehnician fara employee produce attendance fara timesheet |
| V52 | oracle + emulator/justificare | PASS | blocking | 0.006s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Admin fara employee este refuzat la START |
| V53 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Doua START simultan produc o singura sesiune |
| V54 | oracle + emulator/justificare | PASS | non-blocking | 0.008s | CHARACTERIZATION_ACTIVE_WITHOUT_LOCK | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Sesiune active fara lock permite a doua sesiune |
| V55 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Lock orfan este suprascris |
| V56 | oracle + emulator/justificare | PASS | blocking | 1.769s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | STOP la 30 secunde este refuzat |
| V57 | oracle + emulator + UI | PASS | blocking | 1.051s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | STOP exact la 60 secunde este permis |
| V58 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Doua STOP simultan produc o singura tranzitie |
| V59 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Primul QR creeaza auto check-in field |
| V60 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Primul QR este ignorat daca exista pontaj in zi |
| V61 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Auto STOP la raport semnat este dezactivat |
| V62 | oracle + emulator/justificare | PASS | non-blocking | 0.007s | FIXED_CRON_LOCK_SCHEMA | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Cron EOD inchide la program si sterge lock-ul |
| V63 | oracle + emulator/justificare | PASS | non-blocking | 0.007s | FIXED_CRON_LOCK_SCHEMA | `tests/e2e/pontaj/calculations/state-lock.spec.ts` | Cron EOD pentru start dupa program inchide la 23:59 |
| V64 | oracle + emulator + UI | PASS | blocking | 0.526s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | STOP cross-month este clamp-uit in ziua START |
| V65 | oracle + emulator/justificare | PASS | non-blocking | 0.008s | CHARACTERIZATION_CROSS_MONTH | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | Sesiune legacy cross-month are selectori contradictorii |
| V66 | oracle + emulator + UI | PASS | blocking | 0.549s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | DST primavara pastreaza durata absoluta de o ora |
| V67 | oracle + emulator + UI | PASS | blocking | 0.517s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | DST toamna pastreaza durata absoluta de o ora |
| V68 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | 28 februarie 2026 este valid |
| V69 | oracle + emulator/justificare | PASS | blocking | 0.011s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | 29 februarie 2028 este valid |
| V70 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | Cross-year este clamp-uit in 2026 |
| V71 | oracle + emulator/justificare | PASS | non-blocking | 0.007s | CHARACTERIZATION_BROWSER_TIMEZONE | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | Browser UTC poate atribui alta zi decat Functions |
| V72 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/timezone-dst.spec.ts` | Overtime ADD este cap-uit la 23:59 |
| V73 | oracle + emulator + UI | PASS | blocking | 0.499s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | C1/C2/C3 pentru 07:30-17:00 |
| V74 | oracle + emulator + UI | PASS | blocking | 0.524s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | C3-C5 pentru 04:00-21:00 |
| V75 | oracle + emulator/justificare | PASS | blocking | 0.008s | FIXED_TRAVEL_DOUBLE_COUNT | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Traseu catre client produce C1 |
| V76 | oracle + emulator/justificare | PASS | blocking | 0.008s | FIXED_TRAVEL_DOUBLE_COUNT | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Traseu catre casa produce C2 |
| V77 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Sambata WORK produce C6 |
| V78 | oracle + emulator/justificare | PASS | blocking | 0.008s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Duminica WORK produce C7 |
| V79 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Sarbatoare legala produce C7 |
| V80 | oracle + emulator + UI | PASS | non-blocking | 0.579s | CHARACTERIZATION_C6_DUPLICATES | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | C6 dubleaza brut intrari duplicate, prezenta foloseste union |
| V81 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Cerere CO aprobata exclude tichetul, nu orele WORK |
| V82 | oracle + emulator/justificare | PASS | blocking | 0.009s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Toate codurile non-empty cresc zileLucrate |
| V83 | oracle + emulator/justificare | PASS | blocking | 0.007s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Media raportului include angajatul fara timesheet |
| V84 | oracle + emulator/justificare | PASS | blocking | 0.010s | - | `tests/e2e/pontaj/calculations/summary-c1-c7.spec.ts` | Doua zile WORK 8h si 6h dau banca -2h |
| V85 | oracle + emulator + UI | PASS | blocking | 0.567s | - | `tests/e2e/pontaj/calculations/schedules.spec.ts` | Norma individuala neta de 6h produce banca zero |

## Verificari

| Verificare | Rezultat |
|---|---|
| Registru runtime | PASS, 85/85 |
| Playwright complet | PASS, 109/109 |
| Teste unitare relevante | PASS, 146/146 |
| Build Firebase Functions | PASS |
| Build Next.js | PASS in webServer Playwright |
| Typecheck global | FAIL baseline preexistent; erori in module neatinse de Etapa 6 |
| git diff --check | PASS |
| Cleanup dublu | PASS, `{}` |

Verdict: `ALL_85_VECTORS_IMPLEMENTED`.

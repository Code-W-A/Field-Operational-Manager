# ETAPA 7B - inchidere blocari testabilitate

Data: 2026-07-12. Mediu: Firebase Emulator Suite, proiect demo `demo-fom-pontaj-e2e`.

## Implementare

- `STA-004`: fallbackul dupa `fullName` citeste maximum doua rezultate. Daca exista mai mult de unul, Start este refuzat inainte de audit, backfill sau tranzactia attendance. Mesajul cere asociere explicita prin `userUid`.
- `STO-013`: `executeCheckoutPipeline` separa commitul durabil de efectele post-commit. Un adapter test-only arunca la sync si demonstreaza ca attendance ramane `completed`, lock-ul ramane sters si timesheetul nu este scris de client.
- `STO-015`: `executeCheckoutWithConfirmation` garanteaza ca functia de confirmare UI este apelata numai dupa rezolvarea checkoutului. Testul inspecteaza Firestore la intrarea in callback.
- `STO-018`: acelasi pipeline izoleaza eroarea auditului si continua sync-ul. Attendance si timesheet raman persistate.

Adaptoarele de failure sunt in `tests/e2e/pontaj/infrastructure/checkout-fault-adapters.ts`. Aplicatia de productie importa numai orchestratorul neutru din `lib/attendance/checkout-pipeline.ts`.

## Production boundary

Testul `production-boundary.spec.ts` scaneaza `.next/static` si `.next/server/app` dupa:

- markerul modulului test-only;
- numele modulului adapter;
- mesajele celor doua erori injectate.

Rezultat: PASS. Nu exista endpoint HTTP, secret browser, flag E2E sau control pause/release in bundle.

## Executii

| Verificare | Rezultat |
|---|---|
| Cele 4 cazuri tinta + production boundary + setup | 6/6 PASS |
| Regresii fixture STA-005/SYN-010 + setup | 3/3 PASS |
| RT/STA/STO/SYN + production boundary + setup | 74/74 PASS, zero skip |
| Suita Playwright anterioara | 109/109 PASS |
| Unit attendance/HR/lock | 150/150 PASS |
| Next.js production build | PASS |
| Firebase Functions build | PASS |
| Guard proiect Firebase live | PASS, proiectul live refuzat |
| Cleanup dublu | PASS, resurse ramase `{}` |
| `git diff --check` | PASS |

## Defect de fixture descoperit

Prima executie unificata dupa implementare a avut 72 PASS si 2 FAIL. Cauza a fost salariatul duplicat seed-uit de STA-004, ramas pana la teardown global si reutilizat de STA-005/SYN-010. Fixture-ul sterge acum documentul duplicat in `beforeEach` si `afterEach`; regresiile si executia completa ulterioara sunt verzi.

## SYN-002 staging

Triggerul Functions real este PASS blocking in emulator. Companionul staging ramane `DEPLOYMENT_BLOCKED`; acest status nu reduce verdictul motorului executabil local.

## Verdict

`CORE_ATTENDANCE_EXECUTABLE_COMPLETE`

# ETAPA 10A - regresie

Executat local cu Firebase Emulator, `workers=1`:

- `firestore-rules.spec.ts` + `storage-rules.spec.ts`: PASS dupa remedierea regulilor.
- `firestore-offline.spec.ts` + `auth-boundary.spec.ts` + `snapshot-recovery.spec.ts`: PASS, 6 teste.

Nu s-au rulat integral regresiile Reports, HR, Condica, Kiosk, Core si Istoric dupa noile rules. Nu s-au rulat buildurile, boundary, live guard, cleanup dublu sau suitele RES unificate in aceasta sesiune. Acestea sunt preconditii restante pentru verdict complet.

## 10A.1A - lifecycle webServer

Smoke-ul `storage respins` din `external-failures.spec.ts` a trecut de două ori consecutiv cu ambele webServer-e gestionate de Playwright. După fiecare rulare, porturile Emulator/Next sunt libere. Rularea integrală RES-003 a ajuns la test și a eșuat ulterior în locatorul `Cerere`, deci nu mai este blocată de startup.

## 10A.1B - inchidere RES-003

Executat local, proiect Firebase exclusiv `demo-fom-pontaj-e2e`, cu `workers=1`:

- `external-failures.spec.ts`, rularea 1 dupa preflight semantic: 3/3 PASS.
- `external-failures.spec.ts`, rularea 2 dupa preflight semantic: 3/3 PASS.
- `requests/`, `security/firestore-rules.spec.ts`, `security/storage-rules.spec.ts`, `infrastructure/production-boundary.spec.ts`: 19/19 PASS.
- `infrastructure/emulator-stack.spec.ts`: 3/3 PASS, inclusiv refuz explicit pentru proiectul Firebase live si cleanup idempotent.
- `production-boundary.spec.ts` confirma ca adaptoarele test-only STO/CON nu exista in `.next/static` sau `.next/server/app`.
- `global-teardown.ts` a executat `cleanupPontajRun()` de doua ori; raport final `remaining: {}`.
- Verificare post-run: niciun listener pe 3100, 8080, 8085, 9099, 9199; niciun proces Firebase/Next din run. Procesul Playwright `test-server` preexistent a ramas neafectat.
- `git diff --check`: PASS.

Nu s-a rulat RES-008 si nu s-au reluat regresiile mari Core, Kiosk, Condica sau Reports. Regresia larga de cereri a evidentiat un transport email extern activ in configuratia locala; nu se repeta pana la izolarea lui explicita. RES-003 ramane izolat: ruta sa de notificare este interceptata, iar triggerul este no-op pentru `emailChannel: nextjs`.

## 10A.1E - regresie finala locala

Executat dupa ultimele corectii Firestore Rules, cu `workers=1` si proiectul demo:

- RES unificat: 28 PASS, fara FAIL sau SKIP executabil.
- HR plus Requests: 30 PASS; notificarea HR este 503 controlat, fara transport extern.
- Reports: 14 PASS; Condica: 35 PASS; Kiosk fake media: 23 PASS; Core: 76 PASS.
- Istoric atomic contractual: 107 PASS. Adaugarea separata a production-boundary produce 108 PASS, dar nu apartine numarului contractual.
- Unitare relevante: 148 PASS. Build Next si Functions: PASS. Rules Firestore/Storage: compilate in Emulator.
- Cleanup explicit de doua ori: `remaining: {}`. `git diff --check`: PASS.

Kiosk a cerut bind local autorizat dupa un refuz de sandbox; nu este un FAIL de produs. `RES-007` nu a fost rulat ca staging si ramane `STAGING_PENDING`.

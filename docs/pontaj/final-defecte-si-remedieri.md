# Defecte si remedieri finale

| ID | Clasificare | Remediere | Regresie |
|---|---|---|---|
| DEF-FINAL-001 | TEST_INFRASTRUCTURE_BUG | Readiness disponibil numai dupa `All emulators ready!`. | Reports 14/14 si suitele ulterioare PASS. |
| DEF-FINAL-002 | APP_BUG local production-like | Middleware-ul pastreaza hostul local strict in modul Emulator, evitand pierderea Auth la `127.0.0.1` -> `localhost`. | RT-012 tintit PASS; Core 76/76. |
| DEF-FINAL-003 | TEST_BUG | Asertiunea RES-002 dependenta de Rules restrictive a fost mutata sub `@security-hardening`. | RES: 31 PASS, 1 deferred. |
| DEF-FINAL-004 | TEST_INFRASTRUCTURE_BUG | Launcherul semnalizeaza recursiv descendentii JVM; shutdown Playwright are 15 secunde. | Cleanup dublu PASS; zero porturi finale. |
| DEF-FINAL-005 | TEST_INFRASTRUCTURE_BUG | Au fost eliminate doar artefacte generate si buildul Next E2E este reutilizat controlat dupa `ENOSPC`. | HR 30/30 si build Next PASS. |
| DEF-FINAL-006 | DEPLOY_CONFIG_BUG | Rutele de fixture `app/e2e`, Attendance si seed HR reminder erau incluse in buildul public. Au fost eliminate; seedul CLI ramane separat. | Production-boundary strict si build final PASS. |
| DEF-FINAL-007 | APP_BUG transport sink | Allowlist-ul `.invalid` era comparat literal si respingea subdomenii precum `example.invalid`. Intrarea cu punct initial este acum tratata ca sufix strict. | `mail-transport-policy.server.test.ts`: 4/4 PASS; endpoint extern owner/admin/manager/replay/concurenta PASS, zero SMTP. |

Un run Kiosk si unul email-disabled au fost refuzate initial de sandbox la bind local (`EPERM`), apoi au trecut 23/23 si 2/2 cu permisiunea explicita. Nu exista FAIL functional executabil ramas.

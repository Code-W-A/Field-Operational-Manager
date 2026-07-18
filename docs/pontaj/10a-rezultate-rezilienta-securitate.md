# ETAPA 10A - rezultate locale

Data: 2026-07-14. Proiect utilizat exclusiv: `demo-fom-pontaj-e2e`.

| ID | Stare | Dovezi |
|---|---|---|
| RES-001 | IMPLEMENTED_PASSING | `firestore-offline.spec.ts`: unavailable la citire server offline, recovery si anulare inainte de write; 3/3 PASS. |
| RES-002 | IMPLEMENTED_PASSING | `auth-boundary.spec.ts`: logout inainte de commit este refuzat; commit anterior logout ramane persistent; 2/2 PASS. |
| RES-003 | IMPLEMENTED_PASSING | `external-failures.spec.ts` a trecut de doua ori consecutiv: 503 pentru notificarea HR dupa commit pastreaza o singura cerere `pending`; storage respins nu lasa obiect orphan. Cauza blocajului anterior a fost un `FIXTURE_BUG`, nu UI, Rules sau emulator. |
| RES-004 | IMPLEMENTED_PASSING | `snapshot-recovery.spec.ts`: doua clienti Web SDK, listener offline/reconectat, convergenta `hrSettings`; 1/1 PASS. |
| RES-005 | SECURITY_BUG_REMEDIATED | `security/firestore-rules.spec.ts`, Web SDK autentificat/neautentificat; toate probele dupa remediere PASS. |
| RES-006 | SECURITY_BUG_REMEDIATED | `security/storage-rules.spec.ts`, Web Storage SDK; toate probele dupa remediere PASS. |
| RES-008 | FAIL | Matricea responsive/a11y nu a fost implementata/executata in aceasta sesiune. |

Regulile locale nu au fost deployate. RES-007 este `STAGING_PENDING`.

## Matrice de securitate confirmata

`client`, `rol-necunoscut`, `fara-rol` si neautentificat sunt refuzati pe documentele HR si Storage. Tehnicianul isi poate folosi propriul attendance/selfie/CM, nu poate rescrie `users.role`, timesheet-ul altui salariat, loguri existente sau counter-ul cu salt arbitrar. Adminul are fluxurile HR confirmate. Drepturile dispecerului sunt `BUSINESS_BLOCKED_NON_BLOCKING` (BUS-01), caracterizate numai local.

## Limite declarate

`deadline-exceeded`, index absent fidel, momentul exact Auth-expiry versus commit, timeout Storage, camera/GPS/touch OS sunt `TESTABILITY_BLOCKED_NON_BLOCKING` sau `MANUAL_REQUIRED_NON_BLOCKING`; nu s-au introdus endpoint-uri sau hook-uri in bundle-ul de productie.

## 10A.1B - RES-003

Testul re-seeda anterior Firebase Auth dupa ce `auth.setup.ts` salvase `storageState`. Actualizarea utilizatorilor Auth invalida sesiunea browserului, iar `/dashboard/cereri` redirectiona la login. Fixture-ul RES-003 foloseste acum `seedMinimalPontajFixture({ auth: false })`: datele Firestore sunt resetate, fara a rescrie conturile deja autentificate. Artifactul `artifacts/pontaj/10a/res003-request-button-diagnostic.txt` confirma pagina autentificata, dialogul `Cerere noua`, requestul persistent si raspunsul 503 interceptat.

Rulari complete verzi dupa preflight-ul semantic: doua executii consecutive ale `external-failures.spec.ts`, fiecare cu 3 teste (setup plus 2 RES-003). Cleanup-ul global ruleaza de doua ori si a raportat `remaining: {}`. Nu au ramas porturi 3100/8080/8085/9099/9199 sau procese Firebase/Next de la run.

Izolare RES-003: apelul UI de notificare este interceptat cu 503; documentul are `emailChannel: nextjs`, iar triggerul Functions este no-op. Regresia completa de cereri a aratat separat ca transportul email configurat in mediul local poate comunica extern. Nu a implicat Firebase live, dar testele cu cereri trebuie rulate ulterior cu un transport E2E inert pentru a elimina acel efect extern.

## 10A.1E - rezultat final local

| ID | Stare finala locala | Dovezi 2026-07-17 |
|---|---|---|
| RES-001 | IMPLEMENTED_PASSING | `firestore-offline.spec.ts`, selectie RES unificata 28 PASS. |
| RES-002 | IMPLEMENTED_PASSING | `auth-boundary.spec.ts`, selectie RES unificata 28 PASS. |
| RES-003 | IMPLEMENTED_PASSING | `external-failures.spec.ts`, commit persistent dupa 503 si fara obiect Storage orphan. |
| RES-004 | IMPLEMENTED_PASSING | `snapshot-recovery.spec.ts`, selectie RES unificata 28 PASS. |
| RES-005 | SECURITY_BUG_REMEDIATED | `firestore-rules.spec.ts` verde dupa corectiile de backfill si stale lock. |
| RES-006 | SECURITY_BUG_REMEDIATED | `storage-rules.spec.ts` verde, fara fallback larg. |
| RES-007 | STAGING_PENDING | Nu este evaluabil fara staging; exclus corect din verdictul local. |
| RES-008 | IMPLEMENTED_PASSING | `responsive-pages.spec.ts` este inclus in selectia RES unificata, 28 PASS. |

Notificarea HR este izolata in test cu 503 controlat. Fara SMTP extern, fara Firebase live, fara deploy.

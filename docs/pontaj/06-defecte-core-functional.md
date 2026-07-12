# Defecte core functional pontaj - ETAPA 7

## Defecte aplicatie confirmate si remediate

| ID | Detector | Simptom | Cauza | Remediere | Regresie | Status |
|---|---|---|---|---|---|---|
| DEF-E7-001 | SYN-003 | Batch-ul manual de sync esua cu `Unsupported field value: undefined`. | Payloadul intrarii includea proprietati optionale cu valoarea `undefined`, respinse de Firestore. | Constructorul payloadului omite campurile optionale absente in `lib/attendance/sync-timesheet-entries.ts`. | `attendance-timezone.test.ts` si SYN-003..SYN-014. | FIXED/PASS |
| DEF-E7-002 | RT-018 | Utilizatorul autentificat fara document `users/{uid}` ramanea intr-un loader infinit. | Starea auth era autentificata, dar profilul absent nu avea o tranzitie fail-closed. | Callbackul auth seteaza loading la inceput; `ProtectedRoute` face sign-out si redirect la login pentru profil absent. | RT-018 si regresiile RT. | FIXED/PASS |

## Defecte infrastructura si test remediate

| ID | Categorie | Detector | Cauza | Remediere | Status |
|---|---|---|---|---|---|
| DEF-E7-003 | FIXTURE_BUG | SYN-006 | Emulatorul Pub/Sub nu era pornit, deci functia programata nu putea fi invocata real. | Port Pub/Sub, launcher si publicare pe topicul `firebase-schedule-autoStopAttendanceSessions`. | FIXED/PASS |
| DEF-E7-004 | FIXTURE_BUG | Rulari repetate | Procese Java ale emulatorului puteau ramane orphan dupa Playwright. | Shutdown controlat al web serverelor si process-group handling. | FIXED/PASS; zero procese orphan observate |
| DEF-E7-005 | TEST_BUG | STA-014 | Testul accepta doar `missing`, desi fallbackul camerei poate salva legitim `error`. | Oracle-ul accepta cele doua stari produse de contractul UI. | FIXED/PASS |
| DEF-E7-006 | TEST_BUG | RT read-only | Snapshotul considera logul intentionat de logout o mutatie HR/attendance. | Comparatia ignora colectia audit `logs`, dar continua sa compare datele sensibile. | FIXED/PASS |
| DEF-E7-007 | TEST_BUG | STA-016 | Contextul de test mostenea geolocation din proiect, deci refuzul GPS nu era determinist. | Override explicit al API-ului Geolocation in context. | FIXED/PASS |
| DEF-E7-008 | TEST_BUG | SYN-004 | Locatorul calendarului gasea doua popover-uri si incalca strict mode. | Locatorul este restrans la popover-ul vizibil relevant. | FIXED/PASS |

## Blocaje inchise in ETAPA 7B

| ID | Categorie | Ce lipseste | Impact |
|---|---|---|---|
| STA-004 | CLOSED/PASS | Fallbackul fullName ambiguu este refuzat; userUid explicit permite Start. | Zero attendance, lock si backfill la ambiguitate. |
| STO-013 | CLOSED/PASS | Pipeline cu adapter sync test-only. | Commitul attendance ramane persistent cand hrTimesheets esueaza. |
| STO-015 | CLOSED/PASS | Limita checkout rezolvat inainte de confirmare. | Starea Firestore este verificata in callbackul pre-confirmare. |
| STO-018 | CLOSED/PASS | Pipeline cu adapter audit test-only. | Eroarea auditului nu inverseaza attendance sau timesheet. |
| SYN-002 | DEPLOYMENT_BLOCKED | Proiect companion staging aprobat si trigger deployat verificabil. | Emulatorul este PASS; motorul local nu este blocat. |

Adaptoarele care arunca erori exista numai sub `tests/` si markerul lor lipseste din buildul production-like. Nu au fost accesate sau mutate date Firebase live.

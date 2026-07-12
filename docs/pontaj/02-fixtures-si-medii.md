# Etapa 3 - Fixtures și medii pentru suita Playwright Pontaj

Data proiectării: 11 iulie 2026. Acest document este un contract de implementare; nu creează utilizatori, documente Firebase, obiecte Storage sau configurații Playwright.

## 1. Reguli de izolare

- Fiecare worker primește `runId=E2E_PONTAJ_<UTC compact>_w<workerIndex>` și `ownerRunId` pe orice document care permite câmpuri suplimentare.
- ID-urile deterministe au forma `e2e_<runId>_<tip>_<n>`; Auth UID-urile staging sunt precreate și nu se șterg per test.
- Niciun test nu citește sau reutilizează date fără prefixul run-ului, exceptând `hrSettings/defaults`, contorul și documentele anuale, care se salvează/restaurează exclusiv în emulator sau într-un proiect staging dedicat.
- Seed-ul se face prin Admin SDK/helper de setup în afara paginii testate. Acțiunea de business se face prin UI, dacă matricea nu marchează `seed direct`.
- Cleanup rulează în `finally`/global teardown chiar după eșec: Firestore children/references, Auth temporar, Storage prefix și state files.
- Testele destructive sunt seriale numai în interiorul namespace-ului propriu; nu folosesc ordinea altui test.
- LIVE nu primește seed, cleanup sau scrieri. O pagină care apelează `seedHrIfEmpty` se deschide live numai dacă build metadata demonstrează `NEXT_PUBLIC_ENABLE_HR_SEED != true`; faptul că HR nu este gol nu este singurul guard.

## 2. Medii

| ID | Mediu | Utilizare permisă | Interdicții | Dovezi/artefacte |
|---|---|---|---|---|
| `ENV-EMU` | Firebase Emulator + aplicație locală | toate scrierile, reguli, concurență, vectori V01-V85, clock/DST, cleanup | servicii reale, date live | emulator export la eșec, trace, screenshot, dump documente before/after |
| `ENV-STG` | proiect Firebase + deployment Vercel/Functions staging izolat | Auth real, Functions, indexuri, Storage, geolocation/reverse-geocode controlat | date non-E2E, teste destructive paralele pe defaults | trace, request log, function logs, Storage metadata |
| `ENV-LIVE-RO` | `https://fom-nrg.vercel.app` | rute, redirect, loading/empty existent, filtre read-only, console/network | Start, Stop, Sync, Save, Delete, Create, Edit, Apply, resync, export cu efect extern | screenshot, trace numai la eșec, console/network log |
| `ENV-MANUAL` | dispozitiv fizic autorizat pe staging | cameră reală, GPS, touchscreen, orientare, permission prompts OS | producție, biometrie reală neaprobată | checklist semnat, model/OS/browser, video opțional |
| `ENV-BLOCKED` | neexecutabil | criteriu viitor după decizie/hook/deployment | nu devine blocking | ticket și decizie necesară |

### Servicii emulator

- Auth, Firestore, Storage și Functions trebuie pornite împreună; aplicația trebuie să indice explicit hosturile emulatorului. Audit Etapa 4: aceasta este o cerinta neimplementata in workspace-ul curent, nu o capabilitate existenta.
- Seed/inspect/cleanup folosește Admin SDK emulator, nu Web SDK cu rules bypass neintenționat în corpul testului.
- Testele `SEC-*` folosesc Web SDK autentificat/neautentificat pentru a demonstra rules; Admin SDK este permis numai la arrange/cleanup.
- Cronurile nu așteaptă ora reală. Helperul de test invocă handlerul intern/controlat sau endpoint emulator protejat, cu `nowMs` fix; în lipsa acestui hook testul este `TESTABILITY_BLOCKED`.
- Email/reverse geocode sunt interceptate la nivel HTTP; nu se trimit emailuri și nu se apelează servicii externe în emulator.

### Staging

- Prefix obligatoriu în displayName/email/document ID: `[E2E-PONTAJ:<runId>]`.
- Retenție maximă 24h și job separat de garbage collection după `ownerRunId`.
- Functions deployment SHA și Vercel build SHA se capturează înaintea suitei; neconcordanța oprește testele mutante.
- Testele Storage folosesc imagini sintetice fără persoane reale.

## 3. Configurații browser proiectate

| ID | Proiect viitor | Context | Permisiuni |
|---|---|---|---|
| `BR-ADMIN` | `chromium-admin` | desktop 1440x900, `Europe/Bucharest`, storage state admin | geolocation numai per test |
| `BR-DISP` | `chromium-dispecer` | desktop, Bucharest | fără cameră implicit |
| `BR-TECH` | `chromium-tehnician` | desktop, Bucharest | geolocation controlată, media fake |
| `BR-KIOSK` | `chromium-kiosk` | 1366x768, Bucharest, kiosk state | geolocation + fake camera per test |
| `BR-UNAUTH` | `chromium-unauthenticated` | context nou fără cookies | niciuna |
| `BR-UTC` | `chromium-utc` | timezone `UTC` | ceas fix |
| `BR-LONDON` | derivat timezone | `Europe/London` | ceas fix |
| `BR-NY` | derivat timezone | `America/New_York` | ceas fix |
| `BR-MOBILE` | `chromium-mobile` | 390x844, touch | media fake |
| `BR-KIOSK-TOUCH` | `chromium-kiosk-touch` | 1024x768 + touch, portrait/landscape | media/geolocation fake |
| `BR-SEC` | `security-emulator` | contexte per rol | Web SDK direct |

`locale=ro-RO`; timezone Functions rămâne `Europe/Bucharest`. Timpul se fixează înainte de prima navigare prin clock Playwright sau hook-ul E2E existent; nu se folosește `Date.now()` real în scenariile calendaristice.

## 4. Identități

| Fixture | UID/email determinist | Rol | Documente și relații | Reutilizare/cleanup |
|---|---|---|---|---|
| `USR-ADMIN` | emulator: `e2e_admin_<runId>` / `admin+<runId>@e2e.invalid`; staging: UID fix precreat | admin | Auth + `users/{uid}`; opțional `EMP-ADMIN` | emulator se sterge; staging revine la baseline |
| `USR-DISP` | `e2e_disp_<runId>` | dispecer | Auth + users; opțional employee asociat | un worker |
| `USR-TECH` | `e2e_tech_<runId>` | tehnician | Auth + users + `EMP-ACTIVE.userUid` | baza fluxurilor Start/Stop |
| `USR-KIOSK` | `e2e_kiosk_<runId>` | kiosk | Auth + users cu parolă kiosk | context dedicat serial |
| `USR-CLIENT` | `e2e_client_<runId>` | client | Auth + users | numai acces negativ |
| `USR-UNKNOWN` | `e2e_unknown_<runId>` | `unknown_e2e` | Auth + users | acces negativ |
| `USR-NOROLE` | `e2e_norole_<runId>` | fără `role` | Auth + users | security |
| `USR-NODOC` | Auth fără `users/{uid}` | necunoscut | numai Auth | auth edge |
| `USR-UNAUTH` | absent | neautentificat | niciun document | context nou per test |

State files se generează prin login UI/API de setup, niciodată prin copierea sesiunilor live. Testele de expirare invalidează tokenul în emulator și creează context nou după caz.

## 5. Salariați

Toți au `nume="E2E <runId>"`, ID explicit și `active` conform tabelului.

| Fixture | Câmpuri distinctive | Relații | Folosire paralelă |
|---|---|---|---|
| `EMP-ACTIVE` | activ, `userUid=USR-TECH`, program 08:00-16:30, pauză 12:30-13:00, email | `DEP-ACTIVE` | un clone per worker |
| `EMP-INACTIVE` | `active=false`, UID propriu | departament activ | read/roster |
| `EMP-NOUID` | activ, fără userUid, fullName unic | fallback/no mapping | serial dacă face backfill |
| `EMP-LEGACY` | activ, `fullName` egal displayName USR legacy | fără userUid | test fallback, apoi cleanup |
| `EMP-HOMONYM-A/B` | aceleași nume/fullName, ID diferit | fără UID | `BUSINESS_BLOCKED` pentru alegerea corectă |
| `EMP-NOPROGRAM` | fără program/pauză | defaults | fallback |
| `EMP-PARTIAL` | start 09:00, end lipsă; pauzăStart 12:00, end lipsă | defaults completează per câmp | fallback parțial |
| `EMP-6H` | 09:00-15:30, pauză 12:00-12:30 | normă netă 6h | V85 |
| `EMP-NODEPT` | `sectorIds=[]` | fără departament | Start neafectat |
| `EMP-MULTIDEPT` | două sectorIds + manager per sector | DEP-ACTIVE/SECOND | cereri |
| `EMP-NOEMAIL` | activ, user asociat fără email eligibil | exclus din kiosk | roster |
| `EMP-INDIVIDUAL-BREAK` | pauză 13:00-13:30 | suprascrie defaults | V26 |
| `EMP-NOBREAK` | fără pauză, defaults temporar fără pauză | niciuna | calcul fără pauză |
| `EMP-ADMIN` | activ, userUid=USR-ADMIN | pentru kiosk/admin Start | serial |
| `EMP-DISP` | activ, userUid=USR-DISP | pentru kiosk/dispecer Start | serial |

## 6. Departamente și defaults

| Fixture | Document | Conținut | Restaurare |
|---|---|---|---|
| `DEP-ACTIVE` | `hrDepartments/e2e_<runId>_active` | active, managerUid USR-ADMIN | delete |
| `DEP-SECOND` | `..._second` | active, managerUid USR-DISP | delete |
| `DEP-INACTIVE` | `..._inactive` | active=false | delete |
| `DEP-ASSOCIATED` | `..._associated` | referit de EMP-MULTIDEPT | employee first, apoi dept |
| `CFG-DEFAULT` | `hrSettings/defaults` | 08:00-16:30, 12:30-13:00 | snapshot exact înainte, restore în teardown |
| `CFG-NOBREAK` | același doc temporar | program fără pauză | test serial + restore |
| `CFG-PARTIAL` | același doc temporar | câmpuri individuale lipsă controlat | serial |

## 7. Attendance și lock-uri

| Fixture | Documente | Stare exactă |
|---|---|---|
| `ATT-NONE` | nimic | fără sesiune/lock |
| `ATT-ACTIVE` | `attendance/att_<uid>_<ms>` | status active, Timestamp start, employeeId, mode/location/device, timestamps |
| `ATT-COMPLETED` | aceeași formă + end | status completed și checkout metadata |
| `LOCK-VALID` | `attendanceActiveSessions/{uid}` | `activeSessionId=ATT-ACTIVE.id` |
| `LOCK-STALE` | lock spre ATT-COMPLETED | nu trebuie să blocheze Start |
| `LOCK-ORPHAN` | lock spre ID inexistent | nu trebuie să blocheze Start |
| `ATT-UNLOCKED` | ATT-ACTIVE fără lock | cititorul o găsește; Start nou poate produce MULTI_ACTIVE |
| `ATT-MULTI` | două active pentru același UID, lock spre cea mai nouă | cititorul selectează cea mai nouă |
| `ATT-NOEMP` | completed fără employeeId | rezolvare UID/nume |
| `ATT-QR` | active, `checkInAuto=true`, reason first_qr | flux QR |
| `ATT-CRON` | active veche + lock cu `activeSessionId` | cron completează sesiunea; lock-ul rămâne stale pe codul curent deoarece Functions verifică `sessionId` |

Timestampurile sunt construite din instantele UTC ale vectorilor. Nu se scriu stringuri ISO în câmpurile Firestore Timestamp.

## 8. Timesheet days

Documentul de bază este `hrTimesheets/{employeeId}_{monthKey}`, cu `days` map și chei necompletate (`"1"`).

| Fixture | Celulă |
|---|---|
| `DAY-EMPTY` | document/zi absentă |
| `DAY-WORK` | `{code:"WORK",hours:8,entries:[08:00-16:30],breaks:[]}` |
| `DAY-WORK-NOHOURS` | `{code:"WORK",entries:[]}` -> 0h curent |
| `DAY-WORK-NOENTRIES` | `{code:"WORK",hours:6}` |
| `DAY-CONTRADICT` | `hours:99`, entries 08:00-16:30 -> helperul recalculează entries |
| `DAY-MANUAL` | entry manual fără project Pontaj/sessionId |
| `DAY-PONTAJ` | entry cu project Pontaj, sessionId, timestamps absolute |
| `DAY-MIXED` | manual + Pontaj suprapuse |
| `DAY-BREAK-MANUAL` | breaks valide |
| `DAY-CO/CFP/CM/IN` | cod protejat, metadata request |
| `DAY-DEL/WE/SL` | cod compatibil cu Pontaj |
| `DAY-LEGACY-DST` | Pontaj fără `startTimestampMs/endTimestampMs` |

Fixture-urile V01-V85 sunt generate data-driven din `01-vectori-test.md`, fără schimbarea oracolului numeric.

## 9. Cereri, sărbători, lucrări și logs

| Fixture | Documente/câmpuri |
|---|---|
| `REQ-PENDING` | hrRequests, kind parametrizat, status pending, payload, serial |
| `REQ-APPROVED-*` | câte unul CO/CFP/CM/DEL/IN/ADD_OVERTIME, status approved |
| `REQ-REJECTED` | status rejected + reason |
| `COUNTER` | `hrCounters/leaveRequestSerial`, snapshot/restore serial |
| `HOL-2026` | `hrHolidays/2026.items` cu dată E2E și 2026-03-29/2026-10-25 numai unde e necesar |
| `WORK-FIRST-QR` | lucrare tehnician, primul QR acceptabil |
| `WORK-OPEN` | status blocant în ziua controlată |
| `WORK-DONE` | status terminal |
| `LOG-EMPTY` | fără logs pentru run |
| `LOG-FAIL` | rules/network fault injectat numai pentru colecția logs |

## 10. Storage, cameră și geolocation

- `IMG-SELFIE`: JPEG sintetic 320x240, pattern color, fără persoană; media fake îl furnizează camerei Chromium.
- `IMG-PROFILE`: PNG sintetic; `DOC-CM`: PDF minimal sintetic fără date personale.
- Path-urile se află exclusiv sub prefixurile E2E. La cleanup se listează și șterge prefixul, apoi se confirmă zero obiecte.
- Camera: `granted`, `denied`, `not-found`, stream întrerupt și upload 500/permission-denied.
- Geolocation office: coordonata kiosk exactă; field: punct >50m; boundary: 49m/50m/51m calculate înainte de test.
- GPS: granted, denied, timeout. Reverse geocode: 200 cu adresă fixă, 500 și timeout.
- Prompturile OS reale, acuratețea GPS și rotația camerei sunt `MANUAL_DEVICE_REQUIRED`; Playwright poate simula permission/geolocation/media stream și upload.

## 11. Date fixe timezone/DST

| ID | Instant(e) UTC | Bucharest | Scop/oracol |
|---|---|---|---|
| `TIME-NORMAL` | 2026-07-08T05:00Z/13:30Z | 08:00/16:30 | V01 |
| `TIME-EOM` | 2026-07-31T20:00Z -> 21:30Z | 23:00 -> 00:30 | clamp/lună |
| `TIME-EOY` | 2026-12-31T21:30Z -> 2027-01-01 | an |
| `TIME-SPRING` | 2026-03-29T00:30Z -> 01:30Z | 02:30 -> 04:30 | 60 minute absolute, V66 |
| `TIME-AUTUMN` | 2026-10-25T00:30Z -> 01:30Z | 03:30 -> 03:30 | 60 minute absolute, V67 |
| `TIME-LEAP` | 2028-02-29T10:00Z | 12:00 | V69 |
| `TIME-EOD` | 2026-07-08T20:59:59.999Z | 23:59:59.999 | cron |

Fiecare test timezone notează separat timezone browser, instant UTC și rezultatul Bucharest. Independența conversiei se verifică prin citirea Timestamp și prin UI, nu prin reutilizarea aceleiași funcții din aplicație în oracol.

## 12. Cleanup verificabil

1. Captură listă `before` pentru documentele singleton afectate.
2. Ștergere obiecte Storage după prefix.
3. Ștergere în ordine: logs/attendance/locks/timesheets/requests/works/employees/departments/users.
4. Restaurare `hrSettings/defaults`, `hrHolidays/{year}`, counter.
5. Ștergere Auth emulator/staging temporar.
6. Query final după `ownerRunId` și prefix; așteptat zero.
7. La eșec cleanup, suita eșuează separat și păstrează manifestul resurselor rămase.

Manifestul trebuie persistat inainte de fiecare mutatie. La SIGKILL/CI cancel, urmatorul global setup ruleaza recovery dupa manifest; `finally` singur nu este suficient. Un emulator dedicat run-ului poate fi resetat integral, iar staging necesita janitor TTL.

Fixtures staging precreate nu se șterg, ci se readuc la baseline versionat. Cleanup nu rulează niciodată în `ENV-LIVE-RO`.

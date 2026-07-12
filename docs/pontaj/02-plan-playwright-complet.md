# Etapa 3 - Plan Playwright complet pentru Pontaj

## 0. Scop și surse

Planul transformă în teste executabile analiza din:

- `docs/pontaj/00-inventar-aplicatie.md`;
- `docs/pontaj/01-reguli-si-oracole.md`;
- `docs/pontaj/01-vectori-test.md`.

Nu implementează teste, fixtures, config sau hooks. Oracolul curent urmează actualizarea post-remediere din Etapa 2; caracterizările legacy/deployment sunt separate în `02-blocaje-si-decizii.md`.

## 1. Strategia de verificare

Un flux P0/P1 de pontaj trece numai dacă se demonstrează lanțul:

```text
UI -> attendance/{sessionId} -> attendanceActiveSessions/{uid}
   -> sync client/Functions -> hrTimesheets/{employeeId}_{YYYY-MM}.days.{day}
   -> dashboard -> condică -> profil -> rapoarte -> logs/Storage
```

Toastul, închiderea dialogului sau HTTP 200 sunt condiții intermediare. Helperul de inspectare Firebase trebuie să citească independent documentele și să compare câmpuri, tipuri Timestamp, absențe și numărul exact de entry-uri. Pentru proiecții, testul navighează/reîncarcă fiecare consumator și verifică valoarea numerică din vector.

### Politica de mediu

- `EMULATOR`: mediu principal pentru orice scriere, rules, erori, timp și concurență.
- `STAGING`: integrare deployment/Auth/Functions/indexuri/Storage; numai date E2E.
- `LIVE_READ_ONLY`: rute, redirect, vizualizare și filtre fără efecte de scriere.
- `MANUAL_DEVICE`: hardware/OS real pe staging.
- `BLOCKED`: criteriu documentat, neactiv.

Audit Etapa 4: aceste medii sunt tinte, nu infrastructura existenta. Workspace-ul curent nu conecteaza aplicatia la emulatoare, iar `firebase.json` nu declara Auth/Storage Emulator. Niciun caz `EMULATOR` nu este activ pana la GATE-01/02 din `03-gates-si-siguranta.md`.

Niciun test live nu apasă Start, Stop, Sincronizează, Salvează, Șterge, Creează, Editează, Aplică sau Re-sincronizează.

## 2. Format obligatoriu și moștenire

Fiecare ID din registru reprezintă un caz logic unic. Fișa completă a cazului este compusă din:

1. câmpurile comune `BASE`;
2. profilul `PF-*` indicat;
3. rândul cazului;
4. fixture-ul din `02-fixtures-si-medii.md`;
5. vectorul V01-V85, unde există.

Această moștenire completează obligatoriu toate câmpurile cerute; o valoare `—` înseamnă „nu se aplică și se asertează absența”, nu câmp omis.

### `BASE` pentru toate cazurile

| Câmp | Valoare obligatorie |
|---|---|
| ID/titlu/scop/modul/rută/componentă | din registrul cazului |
| prioritate/tip/mediu/rol | din registru; tipurile folosesc vocabularul cerut |
| sursă/vector/regulă/clasificare | document + secțiune; vectorul și clasificarea se moștenesc literal |
| precondiții/documente Firebase/Storage | fixture IDs; manifestul seed salvat ca artefact |
| autentificare | storage state al rolului sau context gol; UID asertat înainte de pasul 1 |
| dată/timezone | clock fix; browser din profil; Functions `Europe/Bucharest` |
| permisiuni/geolocation/media | explicit `granted/denied/not-applicable`; niciodată default implicit |
| requesturi mock | listă exactă sau `none`; request neașteptat către serviciu extern eșuează testul |
| UI/toast/dialog/URL | valori din rând/profil; `none` se asertează negativ |
| rezultate Firebase | before/after pentru toate colecțiile din profil, inclusiv „document absent” |
| proiecții | dashboard/condică/profil/raport conform profilului/vectorului |
| refresh/sesiune nouă | obligatoriu pentru P0/P1; P2/P3 dacă rândul nu spune `N/A` |
| aserțiuni negative | fără documente duplicate, fără scrieri în afara runId, fără console/page errors neașteptate |
| cleanup | manifest-driven în `finally`; query final după ownerRunId = zero |
| artefacte | trace la retry unic global, screenshot la eșec, console/network log, dump before/after |
| flakiness | fără timeout fix; așteptare după condiție Firestore/UI; riscul specific din rând |
| blocaje/observații | ID `BUS/DEP/HOOK/DEV` sau `none` |

## 3. Profiluri de execuție

### `PF-ROUTE` - rută/auth read-only

Precondiții: storage state rol + seed minim non-gol în emulator sau zero seed live. Pași: deschide URL direct; observă spinner „Se încarcă...”; așteaptă URL stabil; verifică heading/control principal; refresh; `goBack/goForward`; repetă într-un context nou. Firebase/Storage: nicio scriere; se compară snapshot before/after. Toast/dialog: none. Error/console/network: zero neașteptate. Pentru rol interzis se asertează că niciun text HR sensibil nu devine vizibil înainte de redirect.

### `PF-START` - START complet

Ruta/componenta: `/dashboard/lucrari` + `FieldCheckInCard`, exceptând `PF-KIOSK`. Pași exacți: fixează clock; seed employee/defaults/holiday/timesheet/lock; acordă permisiuni; deschide pagina; pentru field apasă `getByRole('button',{name:/Mă pontez acum/i})`, iar pentru kiosk butonul `Start`; rezolvă confirmarea zilei speciale dacă există; capturează/omite selfie conform cazului; așteaptă toast „Check-In Reușit” sau eroarea exactă; citește sessionId din lock/document.

Succes: `attendance/{att_uid_startMs}` are UID, employeeId dacă rezolvat, Timestamp start exact, status active, mode/location/device, program snapshot, lateness și metadata specială; `attendanceActiveSessions/{uid}.activeSessionId` indică sesiunea; timesheet neschimbat; log Play exact unul; Storage numai dacă selfie. Refresh/context nou arată tură activă. Eșec: attendance/lock/log/Storage absente și UI recuperabil.

### `PF-STOP` - STOP complet

Arrange: ATT-ACTIVE + lock conform cazului, clock fix. Pași: deschide componenta; click Stop; selfie/GPS; așteaptă toast „Check-Out Reușit” sau mesajul exact. Succes: aceeași sesiune devine completed, `sessionEnd` Timestamp/clamp exact, checkout metadata, lock potrivit absent, un log Stop; așteaptă condițional ziua timesheet și verifică entries/hours; apoi dashboard/condică/profil/raport; refresh și context nou arată fără sesiune activă. Eșec sub 60s/lock diferit: sesiunea rămâne active, lock neschimbat, fără sync/log checkout.

### `PF-KIOSK`

Ruta `/kiosk`, rol kiosk. Pași: Start/Stop -> selectează `[data-user-uid]` (până la HOOK-06, nume accesibil unic) -> dialog special day/password dacă activ -> selfie obligatoriu -> GPS -> succes -> revenire la ecranul principal. Persistența urmează PF-START/PF-STOP. Între doi utilizatori se asertează resetarea selected UID, selfie, dialog, error și processing.

### `PF-SYNC`

Pași: seed attendance/timesheet; navighează `/dashboard/resurse-umane/pontaj/sync` sau invocă tranziția STOP/trigger conform cazului; selectează date prin calendar cu dată ISO; click acțiunea; așteaptă toast și `updatedAt` schimbat; citește ziua exactă. Verifică protecții, entries, timestamp metadata, pauză, hours, code, idempotency și proiecții. Status check verifică numai numărul/existența implementată, nu egalitatea conținutului.

### `PF-VECTOR`

Este data-driven, un caz separat `CAL-Vxx` pentru fiecare vector. Seed-ul, instantul, acțiunea, attendance, timesheet, D/C/R și clasificarea sunt copiate literal din `01-vectori-test.md`. Dacă vectorul nu poate fi produs exclusiv prin UI, arrange folosește seed direct, apoi acțiunea UI este deschiderea/sync/resync indicată. Pentru P0/P1 se verifică toate documentele și cele patru proiecții; pentru `CONTRADICTORIE`, se folosește characterization, nu assert business.

### `PF-CONDICA`

Pași: seed luna; deschide condica cu `month`/employee; așteaptă onSnapshot observabil; verifică Grid/Listă/Compact/Detaliat, celula și KPI; deschide dialogul prin rol/nume stabil; execută cazul; așteaptă documentul/absența și actualizarea UI. Refresh + al doilea tab confirmă persistența. Pentru scrieri se verifică `days.{day}` complet, nu doar textul celulei.

### `PF-DIALOG`

Pentru fiecare dialog: open; focus inițial în dialog; Tab/Shift+Tab rămân în focus trap; Escape, X, Cancel și click exterior conform Radix; redeschidere și reset/draft; Enter și dublu submit; disabled/loading; fault Firebase; viewport desktop/mobile. Testele de mutație folosesc doar emulator.

### `PF-HR`

Employee/departament/request/defaults. Pași prin form labels; submit; așteaptă toast și document; verifică timestamps/câmpuri/relații și efect în paginile dependente. Storage este verificat înainte/după Firestore pentru profile/CM. Eșec parțial păstrează explicit obiectul orphan sau absența conform codului caracterizat.

### `PF-REPORT`

Seed exact; deschide raport/filtre; verifică KPI numeric, rânduri/grafice semantic sau hook; compară cu condica/profil. Export: așteaptă `download`, verifică nume, BOM UTF-8, separator, header, număr rânduri, zecimale și diacritice; nicio scriere Firebase.

### `PF-CONCURRENCY`

Două page/context cu barieră `HOOK-19`; ambele ajung înainte de commit, apoi release simultan. Se capturează rezultatul fiecărei promisiuni, winner/loser, retry și starea finală. Invariant: maximum un lock sănătos, documente fără duplicate și timesheet determinist. Fără hook se verifică numai invariantul final și cazul este marcat cu risc mediu.

### `PF-ERROR-SEC`

Fault sau Web SDK direct în emulator. Se asertează codul Firebase/HTTP, UI/toast/console, lipsa scrierilor parțiale și recovery după restabilire. Security separă redirect UI de read/write direct Firestore, Storage și Functions/API.

## 3.1 Exemplu complet expandat - `CAL-V01`

| Câmp | Valoare |
|---|---|
| ID/titlu/scop | `CAL-V01` - Start 08:00, Stop 16:30; demonstrează lanțul complet și pauza implicită |
| modul/rută/componentă | Pontaj field; `/dashboard/lucrari`; `FieldCheckInCard` |
| prioritate/tip/mediu/rol | P0; STATE_MACHINE, LOCK, FIRESTORE_WRITE, SYNC_CLIENT, SYNC_FUNCTION, CALCULATION, PROJECTION, REGRESSION; EMULATOR; tehnician |
| sursă/vector/regulă/clasificare | `01-vectori-test.md` V01; AS+TC+SYNC; `CONFIRMATĂ_PRIN_COD` |
| precondiții | emulatoarele healthy; clock hook; `USR-TECH`, `EMP-ACTIVE`, `CFG-DEFAULT`; zero documente cu sessionId/runId |
| Firebase inițial | users/USR-TECH; hrEmployees/EMP-ACTIVE program 08:00-16:30 pauză 12:30-13:00; defaults identic; attendance/lock/timesheet/logs absente pentru zi |
| Storage inițial | prefix `attendance/selfies/{uid}/att_{uid}_{startMs}` absent |
| autentificare | storage state USR-TECH; UID verificat în AuthContext și users doc |
| timp/timezone | 2026-07-08; Start `2026-07-08T05:00:00Z`, Stop `13:30:00Z`; browser și Functions Europe/Bucharest |
| permisiuni/geolocation/media | geolocation granted la coordonata office; camera granted cu IMG-SELFIE, dar field folosește Skip pentru a izola calculul; reverse geocode 200 fix |
| requesturi mock | `/api/reverse-geocode` -> 200 adresă `E2E Office`; orice alt serviciu extern interzis |
| pași Playwright | 1) clock Start; 2) goto `/dashboard/lucrari`; 3) așteaptă buton Start enabled; 4) click Start; 5) Skip selfie; 6) așteaptă lock+attendance și toast; 7) avansează clock la Stop; 8) click Stop; 9) Skip selfie; 10) așteaptă completed, lock absent și timesheet; 11) navighează succesiv dashboard, condică cu month/employee, fișă, rapoarte |
| UI/toast/dialog/URL | toast Start „Check-In Reușit”; după Start card activ/Stop; toast Stop „Check-Out Reușit”; fără dialog special day/parolă/error; URL-urile rămân cele cerute |
| attendance | un singur `att_{uid}_{startMs}`; start/end Timestamp exacte; status completed; employeeId E1; mode/checkOutMode office; location E2E; metadata device; fără auto flags |
| lock | creat după Start cu `activeSessionId` exact; absent după Stop |
| hrTimesheets | `E1_2026-07.days."8"={code:WORK,hours:8,entries:[P 08:00-16:30 cu attendanceSessionId,startTimestampMs,endTimestampMs],breaks absent/păstrat conform seed}` |
| requests/holidays | neschimbate/absente |
| logs | exact un Play și un Stop pentru sessionId; timestamp server în intervalul commitului |
| Storage | zero obiecte deoarece selfie a fost omis permis în field |
| dashboard | un rând elapsed `8h 30m`; KPI Ore Lucrate `8h`; total sesiuni +1, active0 |
| condică | ziua 8 afișează `08:00`; detaliu interval 08:00-16:30, pauză implicită 12:30-13:00, `attendanceSessionId` exact |
| fișă/raport | fișa lunii +8h; Pontaj HR total +8h și media recalculată exact pe fixture |
| refresh/sesiune nouă | după refresh cardul nu este active; context nou vede completed și toate proiecțiile identice |
| aserțiuni negative | fără al doilea attendance, fără lock, fără entry duplicat, fără document în altă lună/zi/employee, fără console/page error |
| cleanup/artefacte | manifest cleanup complet; trace/screenshot la eșec; before-after JSON pentru 6 colecții; query final runId zero |
| flakiness/blocaje/observații | așteptări pe documente, nu timeout; `HOOK-16` necesar pentru clock; trigger și client pot rula ambele, dar conținutul final trebuie identic |

## 4. Registrul cazurilor non-vector

Coloanele compacte completează `BASE` + profil. `F` = fixture/time/device; `Așteptat` include UI și persistență principală; toate aserțiunile negative/proiecțiile profilului rămân obligatorii.

### 4.1 Rute și acces - `RT-001..020` (20)

| ID | Titlu / rută | P / tip / mediu / rol | Profil, F, pași specifici | Așteptat / sursă / blocaj |
|---|---|---|---|---|
| RT-001 | alias `/pontaj` păstrează query | P2 ROUTE LIVE_RO admin | PF-ROUTE; `?month=2026-07&employeeId=E1` | URL condică cu ambii parametri; inventar 3.1 |
| RT-002 | dashboard pontaj autorizat | P2 ROUTE LIVE_RO admin | PF-ROUTE; schimbă dată fără submit | 4 KPI+tabel/empty, fără write |
| RT-003 | sync autorizat | P2 ROUTE LIVE_RO admin | PF-ROUTE; nu apăsa acțiuni | 3 acțiuni vizibile, DB identică |
| RT-004 | condică autorizată | P2 ROUTE LIVE_RO admin | PF-ROUTE | Grid/KPI/lună vizibile |
| RT-005 | salariați autorizat | P2 ROUTE LIVE_RO admin | PF-ROUTE | program+listă/paginare |
| RT-006 | fișă URL/query | P2 ROUTE EMULATOR admin | EMP-ACTIVE, `?month=2026-07` | tab Pontaj și URL persistă refresh |
| RT-007 | departamente admin | P2 ROUTE LIVE_RO admin | PF-ROUTE | tabel sau empty, Adaugă vizibil |
| RT-008 | rapoarte admin | P2 ROUTE LIVE_RO admin | PF-ROUTE | Pontaj HR + Ore suplimentare |
| RT-009 | alias `/dashboard/kiosk` | P2 ROUTE EMULATOR kiosk | PF-ROUTE | final `/kiosk` |
| RT-010 | `/kiosk` kiosk | P2 ROUTE LIVE_RO kiosk | PF-ROUTE | Start/Stop fără flash dashboard |
| RT-011 | `/pontaj` neautorizat | P0 AUTH/AUTHORIZATION EMULATOR tech/client/unknown/unauth | PF-ROUTE data rows per rol | final lucrări/dashboard/login; fără HR flash/write |
| RT-012 | dashboard pontaj neautorizat | P0 AUTHORIZATION EMULATOR roluri interzise | PF-ROUTE | același contract |
| RT-013 | sync neautorizat | P0 AUTHORIZATION EMULATOR roluri interzise | PF-ROUTE | niciun buton de sync utilizabil |
| RT-014 | condică neautorizată | P0 AUTHORIZATION LIVE_RO tech + EMU rest | PF-ROUTE | redirect final exact |
| RT-015 | salariați neautorizat | P0 AUTHORIZATION EMULATOR | PF-ROUTE | fără listă/nume HR |
| RT-016 | fișă neautorizată | P0 AUTHORIZATION EMULATOR | PF-ROUTE URL direct/refresh | fără date employee |
| RT-017 | departamente dispecer și roluri interzise | P0 AUTHORIZATION EMULATOR dispecer+rest | PF-ROUTE | dispecer: „Acces restricționat”; rest redirect; `BUS-01` |
| RT-018 | rapoarte neautorizat | P0 AUTHORIZATION EMULATOR | PF-ROUTE | fără KPI date |
| RT-019 | alias kiosk pentru non-kiosk | P0 AUTH EMULATOR admin/disp/tech/client/unknown/unauth | PF-ROUTE | `/dashboard`/lucrări/login conform rol |
| RT-020 | schimbare rol/expirare în sesiune | P0 AUTH/AUTHORIZATION EMULATOR toate rolurile | deschide autorizat, schimbă users.role/revocă token, refresh/context nou | conținut dispare și redirect; Firestore direct retestat |

Fiecare RT rulează și loading, direct URL, refresh, back/forward; empty/error/date parțială sunt acoperite în `RES/CON/REP`.

### 4.2 START - `STA-001..020` (20)

| ID | Scenariu | P / tip / mediu / rol | Profil + fixture/acțiune | Oracol specific |
|---|---|---|---|---|
| STA-001 | employeeId furnizat | P0 STATE/FIRESTORE EMU tech | PF-START EMP-ACTIVE | attendance.employeeId exact, lock valid |
| STA-002 | rezolvare după userUid | P0 STATE EMU tech | request fără employeeId | sesiunea primește E1, V49 |
| STA-003 | fallback fullName/backfill | P0 REGRESSION EMU tech | EMP-LEGACY | employee.userUid backfill + Play; V50 |
| STA-004 | omonime | P0 CHARACTERIZATION EMU tech | EMP-HOMONYM A/B | documente observate; fără oracol de alegere; BLK-001 |
| STA-005 | tehnician fără employee | P0 STATE EMU tech | USR-TECH fără employee | active fără employeeId, sync ulterior absent; V51 |
| STA-006 | admin/dispecer fără employee | P0 FORM_VALIDATION EMU admin/disp | PF-START | refuz, zero attendance/lock; V52 |
| STA-007 | inactive/noemail/nodept | P1 CHARACTERIZATION EMU | trei data rows | inactive exclus kiosk; field noemail/nodept conform cod, fără schimb calcul |
| STA-008 | program individual/default/fallback/parțial | P0 CALCULATION EMU | EMP-ACTIVE/NOPROGRAM/PARTIAL + CFG | snapshot și lateness V21-27 |
| STA-009 | devreme/întârziere/floor | P1 CALCULATION EMU | clock 07:30, 09:17:59 | delay 0/17 exact |
| STA-010 | CO/CFP/CM/IN blocat, DEL permis | P0 STATE EMU | DAY/REQ coduri | 4 refuzuri zero write; DEL active |
| STA-011 | overlap boundary | P0 CALCULATION EMU | manual end==Start, contains Start, begins Start | permis/refuz conform `[start,end)` |
| STA-012 | weekend/sărbătoare confirm/cancel | P1 DIALOG EMU | HOL + Sat/Sun | cancel zero write; confirm snapshot complet |
| STA-013 | selfie field optional | P1 STORAGE EMU | media granted/skip/upload fail | skip/fail permit conform field, status salvat |
| STA-014 | cameră denied/not-found | P1 NETWORK_ERROR EMU | permissions/media fault | field continuă fără selfie; kiosk separat |
| STA-015 | GPS office/field/boundary | P1 CALCULATION EMU | 49/50/51m | mode office la prag implementat, field peste; coords exacte |
| STA-016 | GPS denied/timeout/reverse 500 | P1 NETWORK_ERROR EMU | fault rows | Field refuză la GPS; reverse fallback/error caracterizat; zero orphan |
| STA-017 | dublu click/două taburi | P0 CONCURRENCY EMU | PF-CONCURRENCY PF-START | o sesiune+lock, loser error |
| STA-018 | lock stale/orphan | P0 LOCK EMU | LOCK-STALE/ORPHAN | Start suprascrie lock, sesiunea veche neschimbată |
| STA-019 | active fără lock/multi active | P0 CHARACTERIZATION EMU | ATT-UNLOCKED/MULTI | active fără lock poate crea a doua; cititorul alege latest; defect |
| STA-020 | offline/log fail/refresh în operație | P1 OFFLINE/REGRESSION EMU | fault înainte/după commit | înainte: zero write; după: session+lock persistă chiar fără toast/log |

### 4.3 STOP - `STO-001..018` (18)

| ID | Scenariu | P / tip / mediu / rol | Profil + acțiune | Oracol specific |
|---|---|---|---|---|
| STO-001 | Stop normal lock potrivit | P0 STATE/SYNC EMU tech | PF-STOP ATT-ACTIVE+LOCK | completed, lock absent, timesheet/proiecții |
| STO-002 | 30 secunde | P0 VALIDATION EMU | clock +30s | active, mesaj timp rămas, V56 |
| STO-003 | exact 60 secunde | P0 BOUNDARY EMU | +60s | completed, 1m, V57 |
| STO-004 | 61 secunde | P0 BOUNDARY EMU | +61s | completed, entry/timestamps exacte |
| STO-005 | fără sesiune/deja completed | P0 NEGATIVE EMU | ATT-NONE/COMPLETED | mesaj, zero modificări |
| STO-006 | refresh/relogin/token expirat | P1 REGRESSION EMU | ATT-ACTIVE | refresh/relogin găsește active; token expirat redirect fără mutation |
| STO-007 | lock lipsă | P0 LOCK EMU | ATT-UNLOCKED | Stop completează; lock rămâne absent |
| STO-008 | lock spre alt active | P0 LOCK EMU | două sesiuni, lock spre S2, Stop S1 | S1 rămâne active/refuz; S2+lock intact |
| STO-009 | dublu Stop/două dispozitive | P0 CONCURRENCY EMU | PF-CONCURRENCY | un winner; loser „deja închisă”; un singur sync logic |
| STO-010 | checkout selfie/camera/upload | P1 STORAGE EMU | granted/denied/fail | field optional, kiosk obligatoriu; path/status exacte |
| STO-011 | GPS și tranziții mode | P1 CALCULATION EMU | office-office, office-field, field-office, field-field | checkOutMode/location exact, start mode neschimbat |
| STO-012 | sync client succes | P0 SYNC_CLIENT EMU | PF-STOP | zi materializată și toate proiecțiile |
| STO-013 | sync client eșuează după commit | P0 NETWORK_ERROR EMU | fault hrTimesheets | attendance completed+lock absent, timesheet absent; UI/error caracterizat |
| STO-014 | trigger succes/eșec/întârziat | P0 SYNC_FUNCTION STG/EMU | disable client sync controlat | eventual zi; la catch error attendance rămâne completed, fără retry automat |
| STO-015 | refresh după commit înainte de toast | P1 REGRESSION EMU | barrier după transaction | noua pagină vede completed; nu permite Stop repetat |
| STO-016 | cross-midnight/lună/an | P0 TIMEZONE EMU | TIME-EOM/EOY | clamp și document zi START, V64/V70 |
| STO-017 | clamp programEnd/23:59 | P0 CALCULATION EMU | start înainte/după programEnd | end exact program sau EOD, V62/V63 |
| STO-018 | log eșuat după commit | P1 NETWORK_ERROR EMU | LOG-FAIL | completed+sync persistă, logs absent, fără rollback |

### 4.4 Kiosk - `KSK-001..014` (14)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| KSK-001 | roster eligibil roluri | P1 UI/READ EMU | PF-KIOSK employees tech/admin/disp | numai activ+UID+email, 3 roluri |
| KSK-002 | deduplicare/sortare/omonime | P1 REGRESSION EMU | UID duplicat + nume | un rând/UID, ordine ro; selectare UID necesită HOOK-06 |
| KSK-003 | inactive/noemail/nouser/rol neeligibil | P1 NEGATIVE EMU | fixtures | toate excluse |
| KSK-004 | listă goală/loading/query error/retry | P1 UI/NETWORK EMU | fault employees/users | mesaj exact, buton retry reface lista |
| KSK-005 | Start complet | P0 STATE/STORAGE EMU | PF-KIOSK/PF-START | selfie obligatoriu, attendance+lock+Storage |
| KSK-006 | Stop complet | P0 STATE/SYNC EMU | PF-KIOSK/PF-STOP | completed, lock absent, proiecții |
| KSK-007 | tură deja pornită/lipsă | P1 DIALOG EMU | active/none | dialog exact, fără a doua sesiune/stop |
| KSK-008 | zi specială | P1 DIALOG EMU | holiday/weekend | cancel/confirm și snapshot |
| KSK-009 | flag parolă salariat false/viitor true | P1 CHARACTERIZATION/BLOCKED | cod curent + BLK | curent nu cere; acceptare viitoare blocked BUS-09 |
| KSK-010 | cameră/GPS/offline/reconnect | P1 STORAGE/OFFLINE EMU | faults | selfie fail blochează; GPS fallback kiosk conform cod; recovery fără duplicate |
| KSK-011 | utilizatori consecutivi | P1 REGRESSION EMU | E1 Start apoi E2 Start | stare UI resetată, documente separate |
| KSK-012 | dublu tap/scanner rapid | P1 CONCURRENCY EMU | touch + barrier | un singur flow/document |
| KSK-013 | logout cancel/parolă greșită/corectă | P1 AUTH EMU | USR-KIOSK | cancel rămâne; greșită error; corectă logout/login URL |
| KSK-014 | touchscreen/orientare/hardware | P3 RESPONSIVE MANUAL | DEV-01..05 | checklist portrait/landscape, fără overlap; Playwright companion mobile |

### 4.5 Sincronizare - `SYN-001..014` (14)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| SYN-001 | STOP -> client | P0 SYNC_CLIENT EMU | PF-SYNC V01 | zi și proiecții exacte |
| SYN-002 | trigger Functions | P0 SYNC_FUNCTION STG | completed transition | aceeași zi ca client; SHA capturat |
| SYN-003 | manual zilnic | P0 SYNC_CLIENT EMU | UI `Sincronizează` | toast, updatedAt, content exact |
| SYN-004 | interval multi-day | P1 SYNC_CLIENT EMU | select start/end | fiecare zi/lună exact; fără zile în plus |
| SYN-005 | resync ieri | P1 REGRESSION EMU | condică clock fix | ieri Bucharest, idempotent |
| SYN-006 | cron EOD -> trigger | P0 SYNC_FUNCTION/CHARACTERIZATION EMU | handler intern ATT-CRON | completed+timesheet; lock-ul client cu `activeSessionId` rămâne momentan stale deoarece Functions verifică `sessionId`; DEF-LOCK-001 |
| SYN-007 | QR -> Stop -> sync | P0 STATE/SYNC EMU | WORK-FIRST-QR | auto Start metadata, apoi proiecții |
| SYN-008 | multiple/duplicate/overlap | P0 CALCULATION EMU | V04-V06/V44 | toate dovezile, union, fără dublare ore |
| SYN-009 | manual+Pontaj și coduri | P0 REGRESSION EMU/STG | V39-47 | protejate, DEL/WE/SL, client=Function curent |
| SYN-010 | employee resolution | P0 REGRESSION EMU | direct/UID/name/missing | document țintă exact sau absent |
| SYN-011 | pauză manual/default/idempotency | P0 CALCULATION EMU | V08-17/V42 | ore exacte la două rulări |
| SYN-012 | Verifică Status aproximativ | P1 CHARACTERIZATION EMU | timesheet necorelat dar zi existentă | UI poate spune synced; test demonstrează că nu compară content; DEF-SYNC-002 |
| SYN-013 | simultan client+trigger/două manuale | P0 CONCURRENCY EMU | PF-CONCURRENCY | content final identic pentru branch curent, fără duplicate |
| SYN-014 | date invalide/error parțial/timeout/refresh/timezone | P1 VALIDATION/NETWORK EMU | start>end, lipsă, fault zi2, BR-UTC | toast exact; zile deja scrise caracterizate; cleanup; CTR-04 |

### 4.6 Condică și dialoguri - `CON-001..022` (22)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| CON-001 | încărcare/schimbare lună/query | P1 UI/READ LIVE_RO+EMU | PF-CONDICA | URL/selector, days corecte 28/29/30/31 |
| CON-002 | employee filter/Grid/List | P2 UI LIVE_RO | read-only | numai employee; valori identice între views |
| CON-003 | Compact/Detaliat/localStorage | P3 UI/REGRESSION EMU | context nou | `condica-compact-mode` persistă |
| CON-004 | loading/empty/error/date parțiale | P1 UI/NETWORK EMU | fault/seed variants | error console + gol caracterizat DEF-UX-001 |
| CON-005 | KPI total/medie/normă/active/CO | P0 CALCULATION EMU | V35/83-85 + active | valori exacte și tooltip formula |
| CON-006 | summary zile/tichete/prezență/trasee/C1-C7 | P0 CALCULATION EMU | V73-82 | fiecare coloană exactă |
| CON-007 | toate codurile/zi absentă/contradict | P0 PROJECTION EMU | DAY fixtures | cod/total helper comun, V28-36 |
| CON-008 | onSnapshot două taburi/delete | P1 REALTIME EMU | două pages | ambele actualizate după document condition |
| CON-009 | detaliu zi metadata | P1 DIALOG EMU | DAY-PONTAJ | interval/metodă/proiect/late/session/selfies/status |
| CON-010 | verificări pontaj/curățare | P1 DIALOG EMU | invalid/overlap | diagnostic exact; cleanup elimină numai invalidul |
| CON-011 | edit interval valid/invalid/overlap | P1 FORM_VALIDATION EMU | PF-DIALOG | hours recalc; invalid zero write |
| CON-012 | adaugă interval manual/traseu | P0 FIRESTORE_WRITE EMU | PF-DIALOG | entry fields și toate proiecțiile |
| CON-013 | șterge interval/pauză/zi | P0 FIRESTORE_WRITE EMU | trei rows | deleteField/zi absentă, alte câmpuri păstrate |
| CON-014 | Adaugă condică validări timp | P1 FORM_VALIDATION EMU | lipsă, 24:00, equal, reversed, invalid break | toast/disabled exact, zero write |
| CON-015 | Adaugă overlap/adjacent/manual breaks | P1 CALCULATION EMU | V07-20 | overlap refuz UI; adjacent permis; ore vector |
| CON-016 | Adaugă date/luni/includeri | P1 FORM_VALIDATION EMU | multi-day/weekend/holiday/leave/event | numai date incluse și aceeași lună |
| CON-017 | eroare secvențială la ziua N | P1 NETWORK_ERROR EMU | HOOK-18 | primele zile persistă conform cod; rest absente; defect atomicitate |
| CON-018 | Șterge pontaj validări/partial error | P1 DIALOG/NETWORK EMU | none selected/reversed/missing doc/fault | disabled/toast; no-op sau parțial caracterizat |
| CON-019 | sărbători CRUD draft/save | P1 DIALOG/FIRESTORE EMU | HOL | draft nu scrie; save exact year/items; duplicate/an invalid |
| CON-020 | edit cerere aprobată/CO clear | P1 DIALOG/FIRESTORE EMU | REQ approved | request payload + celule vechi/noi + audit clear |
| CON-021 | contract comun dialog/a11y | P2 ACCESSIBILITY/RESPONSIVE EMU | toate dialogurile data-driven | X/Cancel/Escape/outside/focus/tab/enter/double submit/mobile |
| CON-022 | export CSV condică | P1 EXPORT EMU | V73-85 | download encoding/header/rows/values, zero writes |

### 4.7 Salariați, program, departamente și cereri - `HR-001..016` (16)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| HR-001 | listă/sort/search/page size/empty | P2 UI LIVE_RO/EMU | PF-HR read | ordine și paginare 10/20/50/100 |
| HR-002 | creare/editare/activ | P1 FIRESTORE_WRITE EMU | EmployeeEditDialog | câmpuri exacte; edit rescrie createdAt caracterizat DEF-HR-001 |
| HR-003 | validări nume/program/pauză | P1 FORM_VALIDATION EMU | invalid/partial/start>=end | validările existente; lipsa ordinii este characterization |
| HR-004 | asociere/dezasociere user | P0 FIRESTORE_WRITE EMU | EMP-ACTIVE | userUid exact/absent; Start resolution se schimbă |
| HR-005 | departamente/manager per sector | P1 FIRESTORE_WRITE EMU | EMP-MULTIDEPT | arrays/maps exacte și cerere routing |
| HR-006 | profile photo success/fail/orphan | P1 STORAGE EMU | IMG-PROFILE + faults | path/URL; Firestore fail după upload lasă orphan caracterizat |
| HR-007 | fișă nonexistent/query month/nav | P2 ROUTE/UI EMU | invalid ID/EMP | empty exact; links păstrează employee/month |
| HR-008 | defaults normalize/save missing only | P1 FORM/FIRESTORE EMU | input `8`, CFG | `08:00`; defaults + numai câmpuri lipsă |
| HR-009 | apply all/cancel/batch partial/cache | P1 FIRESTORE_WRITE EMU | >500 employees conceptual/fault | cancel zero; batches/partial exact; sync cache test izolat |
| HR-010 | efect defaults viitor, nu retro attendance | P1 REGRESSION EMU | active before/after save | sesiunea veche snapshot neschimbată; Start nou folosește defaults |
| HR-011 | departament CRUD/toggle/manager | P1 FIRESTORE_WRITE EMU admin | DEP fixtures | timestamps, active, manager exact |
| HR-012 | delete asociat/neassociated/confirm/error | P1 DIALOG EMU | DEP-ASSOCIATED/free | asociat refuz; free delete; cancel no-op |
| HR-013 | dispecer departamente/editări HR | P0 AUTHORIZATION BLOCKED/EMU | BUS-01 | caracterizează UI curent; blocking BLK-005 |
| HR-014 | request CO/CFP/CM/DEL/IN lifecycle | P1 FIRESTORE/STORAGE EMU | PF-HR REQ fixtures | pending/approved/rejected/delete, payload + timesheet |
| HR-015 | serial concurent/notificare/upload CM/DOCX | P1 CONCURRENCY/STORAGE/EXPORT EMU | COUNTER, DOC-CM | seriale unice; notify fail nu corupe; DOCX nume/conținut |
| HR-016 | request overlap/period edit/protected Start | P0 REGRESSION EMU | REQ approved + ATT | overlap refuz; old cells clear/new apply; START/protected resync |

### 4.8 Rapoarte/exporturi - `REP-001..009` (9)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| REP-001 | Pontaj HR KPI/grafice | P0 REPORTING EMU | PF-REPORT V01-85 subset | total/medie/CO/SL/WE identice cu oracol |
| REP-002 | consistență dashboard-condică-profil-raport | P0 PROJECTION EMU | V01-17,35-45,66-85 | identice/diferite exact cum vectorul definește elapsed vs effective/manual |
| REP-003 | angajat fără timesheet/inactiv/date parțiale | P2 REPORTING EMU | EMP variants | activ fără TS intră în numitor; inactiv exclus |
| REP-004 | overtime filters 1/12 luni | P1 REPORTING EMU | requests/year | rânduri numai interval/status/employee selectat |
| REP-005 | reconciliere confirmed/partial/missing | P1 CALCULATION EMU | real evidence | minute și toleranță 1m exacte |
| REP-006 | C1-C7/tichete/bancă/trasee | P1 REPORTING EMU | V73-85 | valori egale sumar/CSV |
| REP-007 | export overtime 3 variante | P1 EXPORT EMU | rows + empty | filenames, BOM, headers, diacritice, disabled empty |
| REP-008 | report loading/empty/error/refresh | P2 NETWORK/UI LIVE_RO+EMU | fault subscriptions | spinner; zero/gol + console defect caracterizat |
| REP-009 | 12 luni/end year/leap | P1 TIMEZONE EMU | TIME-EOY/LEAP | doc months și agregare fără omisiuni |

### 4.9 Reziliență, securitate, concurență și accesibilitate - `RES-001..008` (8)

| ID | Scenariu | P / tip / mediu | Profil/F | Așteptat |
|---|---|---|---|---|
| RES-001 | Firestore offline/unavailable/deadline/index | P1 OFFLINE/NETWORK EMU/STG | PF-ERROR-SEC | UI exact, no corruption, retry manual observabil |
| RES-002 | Auth expirat/logout în operație | P0 AUTH/CONCURRENCY EMU | barrier | commit înainte de expiry persistă; înainte de commit refuză |
| RES-003 | Storage/reverse-geocode/email failures | P1 NETWORK EMU | fault proxy | efectele parțiale exacte per profil, fără servicii reale |
| RES-004 | onSnapshot întrerupt/revenire | P1 OFFLINE EMU | două tabs | stale marcat/console; după online converge fără duplicate |
| RES-005 | rules Firestore direct per rol | P0 SECURITY EMU | BR-SEC | read/write hrTimesheets/users/logs conform rules efective; redirect irelevant |
| RES-006 | rules Storage selfie/path alternativ | P0 SECURITY EMU/STG | IMG + roluri | acces per path; detectează fallback OR DEF-SEC-002 |
| RES-007 | Functions/API authorization | P0 SECURITY STG | invoke endpoints roluri | unauthorized refuz; emulator hook secret; zero mutation |
| RES-008 | responsive/a11y pages | P3 ACCESSIBILITY/RESPONSIVE LIVE_RO+EMU | desktop/mobile/touch | fără overlap; headings/labels/focus; scan axe când stabil |

## 5. Vectorii `CAL-V01..CAL-V85`

Există exact 85 cazuri `PF-VECTOR`, câte unul per rând din `01-vectori-test.md`. Matricea completă, seed-ul și capabilitățile sunt în `02-matrice-trasabilitate.md`. Nu se grupează la raportare: un failure identifică exact Vxx.

Prioritatea fiecarui vector este cea din matricea `02-matrice-trasabilitate.md`: 68 P0 si 17 P1. V62/V63 sunt P0 characterization pana la unificarea campului lock, iar V65/V71/V80 raman characterization/contradictorii. Mediul primar este EMULATOR; V41/V61/V62 au companion STAGING pentru Functions/deployment; cazurile hardware au companion MANUAL fără a înlocui oracolul emulator.

## 6. Cazuri blocate `BLK-001..006`

Cele șase cazuri din `02-blocaje-si-decizii.md` sunt definiții de acceptare viitoare. Au prioritate P1, mediu BLOCKED, nu se implementează active și nu aleg oracol până la decizie.

## 7. Timp și timezone: execuție deterministă

Setul `CAL-V64..V72`, `STA-008/009`, `STO-002..004/016/017`, `SYN-014` și `REP-009` se execută cu:

1. clock instalat înainte de navigare;
2. Timestamp Firestore seed-uit din instant UTC;
3. proiecte Bucharest, UTC, London și New York;
4. oracle independent ce formatează Bucharest fără import din aplicație;
5. Functions timezone capturat din config/log;
6. fără `waitForTimeout`.

Pentru fiecare caz, artefactul `time-oracle.json` conține instant UTC, ora browser, ora Bucharest, month doc, day key, HH:mm, durata attendance, timesheet, dashboard, condică și raport. V66/V67 așteaptă 60 minute pentru entry nou cu timestamps; fixture-ul legacy fără timestamps este characterization până la resync.

## 8. Așteptări și anti-flakiness

Interzis: timeout arbitrar, retry local, CSS/nth-child, date existente, data reală, shared mutable state, cleanup numai la succes. Așteptările permise sunt:

- `expect.poll` pe document/status/lock absent/updatedAt;
- răspuns Firestore/Storage identificat și apoi UI;
- onSnapshot reflectat prin text/testid;
- download event;
- barieră controlată pentru concurență;
- request mock numărat exact.

Un test care trece numai după retry este defect de flakiness. Trace-ul se păstrează, iar cauza trebuie eliminată înainte de blocking.

## 9. Structura viitoare (nu se creează acum)

```text
tests/e2e/pontaj/{auth,routes,salariati,departamente,program,kiosk,field,start,stop,locks,sync,condica,requests,holidays,reports,exports,calculations,concurrency,timezone,dst,offline,security,characterization}/
tests/e2e/fixtures/
tests/e2e/pages/
tests/e2e/helpers/
tests/e2e/data/
tests/e2e/oracles/
```

Page objects: `AuthPage`, `AttendanceDashboardPage`, `SyncPage`, `CondicaPage`, `EmployeeListPage`, `EmployeeDetailsPage`, `DepartmentsPage`, `ReportsPage`, `KioskPage`, `FieldAttendanceCard`. Helpers: emulator admin, Web SDK security probe, clock, media, geolocation, network faults, download parser, convergence poll și cleanup manifest.

Proiecte: `chromium-admin`, `chromium-dispecer`, `chromium-tehnician`, `chromium-kiosk`, `chromium-unauthenticated`, `chromium-bucharest`, `chromium-utc`, `chromium-mobile`, `chromium-kiosk-touch`, `security-emulator`; London/NY sunt variante timezone parametrizate.

## 10. Ordinea recomandată de implementare

1. Safety gates mediu, runId, cleanup, clock și Firebase inspectors.
2. Auth/rules P0 și RT-011..020.
3. Calculatoare/oracle data-driven CAL-V01..V85 fără UI, apoi proiecțiile UI.
4. START/STOP/lock P0 și concurență.
5. Sync client/Functions/cron și characterization.
6. Condică/profil/rapoarte/exporturi.
7. Kiosk/media/GPS și companion manual.
8. HR/departamente/requests/defaults.
9. Rețea/offline/accessibility/responsive.
10. Staging contract și, ultimul, smoke LIVE_READ_ONLY.

Un nivel nu devine blocking până când nivelul anterior are cleanup și artefacte deterministe.

Auditul Etapei 4 stratifica vectorii: toate cele 85 pastreaza ID individual si oracle/integration, dar numai subsetul reprezentativ din `03-audit-etapa-3.md` executa intregul lant UI. Aceasta elimina repetarea fragila fara a elimina cazuri logice.

## 11. Rezumat numeric auditat

### Gate de completitudine

| Verificare | Rezultat |
|---|---|
| toate cele 10 rute și cele 7 identități | mapate în matrice, inclusiv direct URL/refresh/redirect |
| toate stările/dialogurile inventariate | 22 rânduri funcționale în matrice; numărul de componente React nu este folosit ca gate |
| toate colecțiile/Storage/Functions | matrice read/write/security |
| Start/Stop/sync/delete/CRUD/export | cazuri pozitive, negative, error și cleanup |
| toate formulele și automatizările | CAL-V01..V85, SYN/REP/cron |
| contradicții și legacy | CTR/CHR + defect + întrebare + criteriu blocked |
| 15 riscuri și toate funcțiile neverificate | mapare explicită în matrice |
| vectori | 85 rânduri distincte, fără lipsuri/duplicate |
| test fără sursă/oracol | zero; BASE cere sursa și clasificarea |
| P0 blocking executabil fără persistență verificată | zero; characterization/business/testability blocked sunt excluse din blocking |
| scrieri în producție | zero; LIVE_READ_ONLY interzice comenzile mutante |

Numărul reprezintă cazuri logice distincte, nu numărul de proiecte/browser invocations:

| Metrică | Număr |
|---|---:|
| Total teste planificate | 232 |
| P0 | 129 |
| P1 | 84 |
| P2 | 16 |
| P3 | 3 |
| EMULATOR primar | 209 |
| STAGING primar | 3 |
| LIVE_READ_ONLY primar | 13 |
| MANUAL_DEVICE primar | 1 |
| BLOCKED | 6 |
| Characterization (subset) | 17 |
| Vectori acoperiți | 85/85 |
| Rute obligatorii acoperite | 10/10 |
| Stări/dialoguri funcționale mapate | 22/22 |
| Riscuri din inventar mapate | 15/15 |

Formula totalului: 85 cazuri vector + 141 cazuri non-vector (`RT20+STA20+STO18+KSK14+SYN14+CON22+HR16+REP9+RES8`) + 6 cazuri blocked = 232. Priorități: vectori `68 P0 + 17 P1`; non-vector `61 P0 + 61 P1 + 16 P2 + 3 P3`; blocked `6 P1`. Medii primare: vectori `85 E`; non-vector `124 E + 3 S + 13 L + 1 M`; blocked `6 B`. Companion invocations în alte proiecte și aliasurile `CHR-001..017` nu măresc numărul logic.

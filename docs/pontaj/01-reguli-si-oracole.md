# Etapa 2 - Reguli reale de pontaj si oracole

## 0. Domeniu, metoda si legenda

Documentul descrie implementarea existenta, nu o politica HR propusa. Analiza este statica, read-only, asupra aplicatiei si a Firebase Functions, completata cu observatiile live read-only din `00-inventar-aplicatie.md`. Nu au fost modificate aplicatia, Firebase sau datele.

> Actualizare dupa remediere: cele sase neconcordante solicitate ulterior au fost corectate in cod. Sectiunile de mai jos descriu comportamentul nou; celulele Pontaj legacy primesc metadatele DST-safe la urmatoarea resincronizare.

Clasificari folosite:

- `CONFIRMATĂ_PRIN_COD`: comportament determinist demonstrat de implementarea din repository.
- `CONFIRMATĂ_LIVE_READ_ONLY`: comportament observat si in aplicatia live, fara scrieri in aceasta etapa.
- `DEDUSĂ_DIN_COD`: consecinta logica a codului, dar fara executie end-to-end pentru cazul respectiv.
- `CONTRADICTORIE`: exista doua implementari active care produc rezultate diferite.
- `NECONFIRMATĂ_BUSINESS`: codul este clar, dar nu exista confirmare ca reprezinta intentia de business.
- `NECONFIRMATĂ_DEPLOYMENT`: codul local este clar, dar configuratia/deploy-ul live nu a fost demonstrat.

Timezone-ul normativ folosit de functiile explicite de pontaj este `Europe/Bucharest`. Unde codul foloseste timezone-ul runtime al browserului, acest lucru este mentionat separat.

Marcajele se mostenesc la nivel de rand/paragraf: formulele si tabelele de implementare sunt `CONFIRMATĂ_PRIN_COD` daca randul nu contine explicit alta clasificare. Observatiile despre deployment sau intentia HR nu mostenesc acest marcaj si sunt etichetate separat.

## 1. Modelul real de domeniu

### 1.1 Identificatori care nu sunt interschimbabili

| Identificator | Forma si stabilitate | Rol real | Fallback |
|---|---|---|---|
| `userId` / `userUid` | Firebase Auth UID, stabil cat timp contul exista | cheia `users/{uid}`, cheia lock-ului si proprietarul sesiunii attendance | sesiunea nu poate fi pornita fara UID |
| `employeeId` | ID document `hrEmployees`, stabil numai in domeniul HR | proprietarul condicii, cererilor si documentului lunar | START cauta exact `fullName`; sync mai incearca nume normalizat |
| `sessionId` | `att_${userId}_${sessionStartMs}` | ID sesiune bruta individuala | nu este ID de angajat si nu trebuie reutilizat |
| ID lunar | `${employeeId}_${YYYY-MM}` | document materializat cu toate zilele lunii | nu exista fara `employeeId` rezolvat |

`userId` apare in `attendance.userId`, iar campul HR echivalent este `hrEmployees.userUid`. `employeeId` poate fi snapshot in attendance, dar sincronizarea poate rezolva ulterior angajatul. `[CONFIRMATĂ_PRIN_COD]`

### 1.2 Entitati si relatii

#### `users/{uid}`

- ID stabil: UID Firebase Auth.
- Creat/modificat: fluxurile de administrare utilizatori, prin API/Admin SDK; nu de pontaj.
- Citit: AuthContext, roster kiosk, rezolvarea rolului la START, maparea tehnicianului.
- Campuri relevante: `uid`, `email`, `displayName`, `role`; optional `isKioskMode`, `officeLocation` si alte date de profil.
- Timestampuri: depind de fluxul de utilizatori, nu sunt folosite la calculul orelor.
- Relatii: `hrEmployees.userUid`, `attendance.userId`, `attendanceActiveSessions/{uid}`, `logs.userId`, lucrari atribuite.
- Lipsa relatiei HR: tehnicianul poate crea attendance fara `employeeId`; admin/dispecer este refuzat. Kiosk-ul include numai utilizatori eligibili asociati unui angajat activ.
- Contradictie: un `displayName` egal cu numele HR poate activa fallback-ul legacy chiar daca UID-ul nu este legat. `[CONFIRMATĂ_PRIN_COD]`

#### `hrEmployees/{employeeId}`

- ID stabil: document ID HR.
- Creat/modificat: dialogurile de salariat; fallback-ul START poate face backfill la `userUid`.
- Citit: toate paginile HR, START, sync, sumar, kiosk roster.
- Obligatoriu in tip: `nume`, `prenume`, `active`; datele legacy pot avea `fullName`.
- Optional relevant: `userUid`, `departmentIds`, `programLucruStart`, `programLucruEnd`, `pauzaStart`, `pauzaEnd`, functie, email, telefon, meta contract.
- Timestampuri: `createdAt`, `updatedAt`; backfill-ul scrie server timestamp in campul de actualizare folosit de storage.
- Client-side: formularul construieste programul, pauza si departamentele.
- Server-side: timestampurile; nu exista validare server centrala a tuturor invariantelor HR.
- Lipsa departamentului: pontajul functioneaza; filtrele/departamentele nu pot clasifica salariatul.
- Date contradictorii: `employeeId` din sesiune are prioritate la sync fata de `userUid` si nume; START da prioritate potrivirii `userUid`.

#### `hrDepartments/{departmentId}`

- ID stabil: ID-ul salvat de formular.
- Creat/modificat/citit: administrarea departamentelor si filtrele HR.
- Campuri: nume/descriere/stare conform tipului `Department`, plus timestampuri de actualizare.
- Relatie: ID-urile sunt stocate in `hrEmployees.departmentIds`; attendance nu stocheaza obligatoriu departamentul.
- Relatie lipsa: ID-ul ramas pe angajat nu modifica formula orelor; afisarea/filtrarea poate ramane fara eticheta.
- Stergerea este blocata daca departamentul este asociat angajatilor. `[CONFIRMATĂ_PRIN_COD]`

#### `attendance/{sessionId}`

- ID stabil: `att_${userId}_${sessionStartMs}`.
- Creat: `createCheckIn`, inclusiv kiosk, field card sau primul QR.
- Modificat: `createCheckOut`, logurile de traseu si cronurile de inchidere automata.
- Citit: dashboardul de pontaj, cardurile START/STOP, sync client si triggerul Functions.
- Campuri de baza: `userId`, optional `employeeId`/`userName`, `sessionStart`, `mode`, `location`, `status`, `deviceInfo`, `createdAt`, `updatedAt`.
- La finalizare: `sessionEnd`, `checkOutLocation`, `checkOutMode`, selfie/path/status, motive si fanioane auto.
- Timestampuri canonice: `sessionStart`/`sessionEnd` sunt Firestore `Timestamp`; `createdAt`/`updatedAt` sunt `serverTimestamp`. Cererea client transporta initial milisecunde numerice.
- Client-side: GPS, device info, confirmarea zilei speciale si datele selfie.
- Server-side: timestampurile Firestore; cronurile stabilesc finalul si metadatele auto.
- Relatii: lock prin `sessionId`, timesheet prin `employeeId` rezolvat, selfie prin path, lucrari prin automatizari.
- Sursa: `checkInAuto` + `checkInAutoReason`, respectiv UI normal; `mode` este `office` sau `field`.
- Procesare: `status=active|completed`; nu exista un camp separat de sync garantat. Sync-ul este dedus din celula Pontaj/loguri.

#### `attendanceActiveSessions/{userId}`

- ID stabil: UID.
- Creat/suprascris transactional cu START; sters transactional la STOP normal numai daca refera sesiunea oprita.
- Campuri: `userId`, `sessionId`, `sessionStart`, `createdAt`, `updatedAt`.
- Lock-ul este indiciu, nu sursa absoluta: un lock stale nu blocheaza START daca sesiunea lui nu mai este activa.
- Cronurile completeaza sesiunea, dar nu sterg lock-ul. Cititorul ignora lock-ul stale si cauta fallback ultima sesiune activa. `[CONFIRMATĂ_PRIN_COD]`

#### `hrTimesheets/{employeeId}_{YYYY-MM}`

- ID stabil: angajat + luna locala atribuita.
- Creat/modificat: editari manuale, cereri HR, sync client si trigger Functions.
- Campuri document: `employeeId`, `monthKey`, `days`, timestampuri de creare/actualizare.
- `days` este harta cu chei necompletate cu zero (`"1"..."31"`).
- Relatii: materializare din attendance; cereri prin `sourceRequestId`; programe/pauze prin employee/defaults.
- Lipsa employee: sync attendance se opreste, sesiunea bruta ramane.
- Concurenta: actualizarile zilei nu sunt protejate de o tranzactie comuna; ultimul writer poate inlocui intreaga `days.{day}`.

#### `hrRequests/{requestId}`

- ID stabil: document auto-ID; `documentSerial` separat este alocat tranzactional.
- Creat: dialog cerere; modificat: manager/decizie si sincronizare/curatare.
- Campuri: `employeeId`, `requesterUid`, `kind`, `status`, `payload`, serial, note/decizie, timestampuri server.
- Relatii: genereaza coduri/intervale in timesheet; sumarul CO/DEL/IN citeste direct cererile aprobate.
- Contradictie: helperul client pastreaza metadatele `sourceRequest*` pentru mai multe coduri; Functions construieste unele celule doar cu `{code}`. `[CONTRADICTORIE]`

#### `hrHolidays/{year}`

- ID stabil: anul, continutul este lista de `{date,label}`.
- Creat/modificat: setarile HR; citit de confirmarea START si sumar.
- Timestampuri: actualizare server si optional UID editor.
- Precedenta zilei speciale: sarbatoare legala, apoi sambata, apoi duminica.
- Lipsa configuratiei: weekendul ramane detectat; sarbatoarea nu poate fi cunoscuta. `[CONFIRMATĂ_PRIN_COD]`

#### `hrSettings/defaults`

- ID stabil: `defaults`.
- Campuri relevante: program start/end, pauza start/end si alte valori HR.
- Citit: START, sync, sumar, formulare.
- Lipsa programului: fallback hard-coded `08:00-16:30` in fluxurile de pontaj/sumar.
- Lipsa pauzei valide: nu se scade pauza.
- Cache: sync-ul client tine defaults si pauza angajatului in cache de modul, fara invalidare explicita. `[CONFIRMATĂ_PRIN_COD]`

#### `logs/{id}`

- ID: auto-ID.
- Creat: `addUserLogEntry` si adaptoarele de audit pontaj.
- Campuri: utilizator, actiune/descriere/categorie, metadata, `timestamp: serverTimestamp`.
- Scriere best-effort: esecul logului nu anuleaza START/STOP/sync.
- Citit: pagina/logica de audit, fara rol in calculul timpului.

#### `lucrari/{id}`

- ID: document lucrare.
- Relatie START: acceptarea primului QR pentru tehnician lanseaza asincron `ensureAutoCheckInFromFirstQr`.
- Relatie STOP: semnarea raportului incearca `ensureAutoCheckOut`, dar constanta client este `false`.
- Campuri de status sunt folosite pentru a decide daca exista lucrari neterminate; clientul si Functions nu folosesc aceeasi multime de statusuri. `[CONTRADICTORIE]`

#### Storage selfie

- Path: `attendance/selfies/{selectedUserUid}/{sessionId}/{kind}-${timestamp}.jpg`.
- Kiosk: selfie obligatoriu; eroarea de camera/upload blocheaza pontarea.
- Field card: selfie optional; eroarea este memorata in status si pontarea poate continua.
- Firestore pastreaza URL/path/status, nu imaginea binara.
- Integritatea dintre sesiune si obiectul Storage nu este tranzactionala. `[CONFIRMATĂ_PRIN_COD]`

## 2. Masina de stari attendance

### 2.1 Stari compuse

| Stare | Sesiune | Lock | Observatie |
|---|---|---|---|
| `NONE` | inexistenta | inexistent | START permis dupa verificarile de business |
| `ACTIVE_LOCKED` | `active` | refera sesiunea | starea normala dupa START |
| `COMPLETED_UNLOCKED` | `completed` | inexistent | starea normala dupa STOP manual |
| `COMPLETED_STALE_LOCK` | `completed` | refera sesiunea | stare legacy; cronul nou sterge tranzactional lock-ul potrivit |
| `ORPHAN_LOCK` | inexistenta | exista | nu blocheaza; fallback cauta alta sesiune activa |
| `ACTIVE_UNLOCKED` | `active` | inexistent | UI o gaseste prin query; un START concurent/direct poate crea alta sesiune |
| `MULTI_ACTIVE` | minimum doua active | maximum un lock | cititorii aleg sesiunea activa cu `sessionStart` cel mai recent |

`inchisa manual` si `inchisa automat` sunt variante ale starii `completed`, diferentiate prin campurile `auto*`, motiv si `sessionEnd`. `[CONFIRMATĂ_PRIN_COD]`

### 2.2 Tranzitii

| Tranzitie | Functie si preconditii | Citiri / scrieri | UI, log, sync | Retry si concurenta |
|---|---|---|---|---|
| `NONE -> ACTIVE_LOCKED` | `createCheckIn`; UID, program, concediu si suprapunere acceptate | citeste user/employee/defaults/timesheet/requests, apoi tranzactie lock + sesiunea referita; scrie attendance si lock | toast START; log best-effort; fara sync | tranzactia Firestore se reincearca; doua START-uri cu lock sanatos se serializeaza, al doilea esueaza |
| primul QR -> active | `ensureAutoCheckInFromFirstQr`; fara active si fara orice attendance in ziua locala | aceleasi scrieri, `checkInAuto=true`, motiv `first_qr`, mode `field` | toast doar daca caller-ul primeste succes; lucrarea continua independent | doua QR-uri pot trece precheck-ul, dar lock-ul tranzactional permite unul singur daca starea initiala este sanatoasa |
| `ACTIVE_LOCKED -> COMPLETED_UNLOCKED` | `createCheckOut`; sesiune active, minimum 60 secunde daca nu este bypass | tranzactie reciteste sesiune+lock; scrie finalul si sterge lock-ul potrivit | toast STOP; log; apoi sync client | al doilea STOP vede `completed` dupa retry si primeste „Sesiunea este deja inchisa.” |
| active -> completed cron | `autoStopAttendanceSessions`, 23:59 Bucharest, fanion activ | tranzactie reciteste sesiunea si lock-ul; completeaza sesiunea si sterge lock-ul numai daca refera acea sesiune | fara UI; triggerul de update incearca sync admin | retry-ul este tranzactional; o sesiune deja inchisa nu este rescrisa |
| active -> completed schedule grace | `autoCheckOutScheduleGrace`, la 15 minute 17-18 | foloseste aceeasi tranzactie sesiune + lock | fara UI; trigger sync | implementarea exista, dar fanionul este `false` |
| completed -> timesheet | STOP client sau `onAttendanceCheckoutSync` | citeste attendance/employee/defaults/timesheet; inlocuieste ziua | log sync client; triggerul prinde erorile | client si trigger pot scrie simultan variante diferite; ultimul writer castiga |
| active + extra route | `startExtraTimeLog`/`endExtraTimeLog` | update array in attendance | controale traseu | eligibilitate si unicitate verificate client-side; update-urile concurente nu au lock global |

### 2.3 Rezolvarea identitatii

1. Daca sesiunea are `employeeId`, sync il foloseste.
2. Altfel cauta `hrEmployees.userUid == attendance.userId`.
3. Altfel sync client cauta numele normalizat; START cauta exact `fullName` si face backfill best-effort al UID-ului.
4. Fara rezultat, attendance poate ramane fara timesheet.

Fallback-ul pe nume este ambiguu la omonime, iar `limit(1)` nu demonstreaza o alegere business valida. `[NECONFIRMATĂ_BUSINESS]`

## 3. Masina de stari a unei zile `hrTimesheets.days.{day}`

### 3.1 Forma

```text
days."8" = {
  code: WORK|WE|CO|CFP|CM|DEL|IN|SL|EMPTY,
  hours?: number,
  entries?: [{start,end,method?,project?,travel?,attendanceSessionId?,source?,...}],
  breaks?: [{start,end}],
  sourceRequestId?: string,
  sourceRequestKind?: string,
  sourceRequestSerial?: number
}
```

### 3.2 Forme si comportament

| Forma | Calcul / resync |
|---|---|
| zi inexistenta | nu contribuie; sync creeaza `WORK` daca are sesiuni finalizate rezolvabile |
| `WORK` fara entries | toate suprafetele folosesc `cell.hours` daca este numeric; altfel 0 |
| `WORK` cu entries | grila si sumarul recalculeaza unirea intervalelor minus pauza; KPI/profil/raport citesc `cell.hours` |
| o intrare / mai multe | intervalele valide sunt unite pentru calculul efectiv |
| pauza manuala | orice pauza manuala valida elimina complet fallback-ul individual/default |
| pauza implicita | individuala, apoi default; se scade numai intersectia cu prezenta |
| `CO/CFP/CM/IN` | protejate de sync attendance; nu sunt suprascrise |
| `DEL/WE/SL` | sync pastreaza codul, dar poate adauga intervale Pontaj si recalcula `hours` |
| traseu | intrare cu proiect normalizat „Traseu catre client/casa”; poate proveni din extra logs |
| manual | entry fara marker Pontaj; client sync o pastreaza |
| Pontaj | entry cu `project/source` Pontaj si `attendanceSessionId`; este regenerata la sync |
| manual + Pontaj | clientul si Functions le pastreaza pe ambele si calculeaza unirea |
| total calculat | `calcEffectiveMinutes(...) / 60` |
| total fallback | `cell.hours` numeric; lipsa lui inseamna 0 |
| cod HR + intervale | permis pentru DEL/WE/SL; protejat complet pentru CO/CFP/CM/IN |

La resync attendance:

- se sterg intrarile Pontaj/traseu generate anterior;
- se pastreaza intrarile manuale valide si `breaks`;
- se regenereaza intrarile din sesiunile completed si extra logs finalizate;
- intrarile regenerate care se suprapun intre ele sunt sortate, iar intrarea ulterioara este eliminata integral, nu taiata;
- clientul pastreaza codurile `DEL/WE/SL`, altfel scrie `WORK`;
- `CO/CFP/CM/IN` sunt protejate si nu primesc Pontaj;
- metadatele whole-day `sourceRequest*` pot fi pierdute cand ziua neprotejata este reconstruita.

## 4. Functii care calculeaza timp

### 4.1 Nucleul canonic client

| Fisier / functie | Formula exacta si cazuri limita | Apelanti principali |
|---|---|---|
| `lib/hr/time-calc.ts:parseHM` | accepta `H:MM`/`HH:MM`, `0<=H<=23`, `0<=M<=59`; rezultat `60H+M`; altfel `null` | toate calculele de celula/sumar |
| `normalizeRanges` | elimina intervale invalide sau `end<=start`, sorteaza, uneste numai daca `next.start < last.end`; intervalele adiacente raman separate | `calcEffectiveMinutes` |
| `calcEffectiveMinutes` | `E=union(entries)`; `B=union(valid manual breaks)` daca exista minimum una, altfel `defaultBreak` valid; rezultat `max(0, sum(E)-sum(overlap(E,B)))` | sync, grila, sumar, dialoguri |
| `minutesToHM` | `round`, clamp la zero, apoi `floor(min/60):min%60`; poate afisa peste 24h | formulare/helpers |
| `lib/attendance/attendance-timezone.ts:formatAttendanceTimeHHmm` | formateaza timestamp absolut in `Europe/Bucharest`; timestamp invalid arunca | attendance -> entries |
| `lib/attendance/sync-timesheet-entries.ts` | fiecare sesiune completed devine entry `[format(start),format(end)]`; fiecare extra log cu final devine entry separat | ambele sync-uri |
| `lib/attendance/sync-timesheet-merge.ts:normalizeNonOverlappingEntries` | sortare; daca `start < previous.end`, elimina integral intrarea curenta | cell builder client |

Exemplu: entries `08:00-12:00`, `11:00-16:00`, pauza `12:30-13:00` -> union `08:00-16:00=480`, intersectie pauza `30`, rezultat `450 min = 7.5h`.

### 4.2 Program si intarziere

| Functie | Formula |
|---|---|
| `storage.computeLateStart` | `max(0, floor((now - programStartInSameRuntimeDay)/60000))` |
| `getEmployeeScheduleForUser` | camp individual per valoare -> `hrSettings/defaults` per valoare; `createCheckIn` aplica apoi `08:00`/`16:30` |
| `timesheet-summary.getScheduleMinutes` | aceeasi precedenta; daca rezultatul nu este valid sau `end<=start`, schedule devine `null` |
| `checkTimesheetStartOverlap` | blocheaza doar cand minutul START satisface `entry.start <= start < entry.end` |

Plecarea anticipata nu are camp/calcul dedicat in attendance. Poate fi dedusa comparand finalul cu programul, dar nu este persistata drept regula separata. `[NECONFIRMATĂ_BUSINESS]`

### 4.3 Dashboard, condica, profil, raport

| Suprafata | Formula reala |
|---|---|
| dashboard pontaj | grupeaza sesiunile pe angajat, uneste intervalele, aplica pauza individuala/default si corectia DST, apoi rotunjeste totalul la o zecimala |
| rand dashboard | durata `floor((end-start)/60000)` afisata `Hh Mm` |
| KPI condica | numai `WORK`, prin `getTimesheetCellMinutes`; totalul si diferenta sunt rotunjite la intreg |
| grila/lista condica | acelasi `getTimesheetCellMinutes`; lipsa entries/hours = 0 |
| profil salariat | aceeasi formula comuna, cu pauza angajatului/default |
| raport HR | aceeasi formula comuna; media `round1(total/numarAngajatiActivi)`, inclusiv angajatii fara timesheet |
| sumar avansat | aceeasi formula comuna |
| banca de ore | `round2(orePrezenta - nrCeluleWORK * oreProgramNet)`; programul net este program end-start minus intersectia pauzei configurate |

### 4.4 Sumar, tichete si C1-C7

- `zileLucrate`: creste pentru orice celula existenta cu cod diferit de `EMPTY`, inclusiv concedii si coduri speciale. `[NECONFIRMATĂ_BUSINESS]`
- `orePrezenta == oreLucrateEfectiv` in implementarea curenta: WORK cu entries foloseste calculul efectiv; fara entries foloseste `hours` numeric sau 0.
- tichet: WORK cu ore > 0, nu weekend/sarbatoare si fara cerere aprobata CO/CFP/CM/DEL/IN in acea zi.
- `oreSarbatoriLegale`: numai celule `SL`, `hours ?? 8`.
- CO si DEL: numar de date din cereri aprobate, nu numar de celule.
- IN: suma intervalelor valide din cereri aprobate.
- trasee: suma bruta a intrarilor relevante; intervalele duplicate se pot dubla.
- `P = suma bruta a intrarilor Pontaj` (fara union). Daca P=0, weekend C6/C7 foloseste `round(cell.hours*60)`.
- C1: traseu spre client intersectat cu `[00:00, programStart)`; daca zero, diferenta dintre cel mai devreme START Pontaj si programStart.
- C2: traseu spre casa intersectat cu `[programEnd,24:00)`; daca zero, diferenta dintre cel mai tarziu END Pontaj si programEnd.
- `O = Pontaj inainte de start + Pontaj dupa end`, suma bruta.
- `C3=min(120,O)/60`, `C4=min(120,max(0,O-120))/60`, `C5=max(0,O-240)/60`.
- sambata: `C6=P/60`; duminica sau sarbatoare: `C7=P/60`. C1-C5 nu se calculeaza in weekend/sarbatoare.

### 4.5 Cereri si ore suplimentare

- helper client `CORRECT_HOURS`: WORK cu entries/breaks, ore prin `calcEffectiveMinutes`.
- `ADD_OVERTIME`: porneste la programEnd (fallback `16:30`), durata normalizata, final maxim `23:59`, pastreaza entries existente si recalculeaza prin union.
- Functions `calcMinutes` pentru cereri: suma bruta a entry-urilor minus durata bruta a pauzelor, fara intersectie si fara union. `[CONTRADICTORIE]`
- reconcilierea overtime real exclude intrarile generate chiar de cererea overtime; accepta dovezi Pontaj/attendance/traseu dupa programEnd, uneste intervalele suprapuse sau adiacente si compara cu durata ceruta, toleranta un minut.
- durata ceruta acceptata de UI foloseste ore intregi si minute snap la `0` sau `30` prin `lib/hr/overtime-duration.ts`.

## 5. Precedenta programului si pauzei

### 5.1 Program

Pentru fiecare capat separat:

```text
employee.programLucruStart/End
  ?? hrSettings/defaults.programLucruStart/End
  ?? hard-coded 08:00/16:30
```

Campurile individuale partiale se combina cu defaults. In sumar, un rezultat invalid (`end<=start`) anuleaza schedule pentru C1-C5; START isi construieste orele cu parser/fallback local. `[CONFIRMATĂ_PRIN_COD]`

### 5.2 Pauza

```text
daca exista cel putin o pauza manuala valida in zi:
    foloseste unirea tuturor pauzelor manuale valide
altfel:
    pauza employee, cu fiecare camp fallback la defaults
    daca intervalul rezultat nu este valid: nicio pauza
```

- Se scade numai intersectia pauzei cu unirea prezentei.
- O pauza in afara prezentei scade zero.
- Pauzele si prezentele suprapuse sunt unite, deci nu se scad de doua ori.
- O singura pauza manuala valida in afara prezentei suprima totusi pauza default.
- Pauzele manuale invalide sunt ignorate; daca toate sunt invalide, se revine la default.
- Un interval peste miezul noptii (`end<=start`) este invalid, nu este impartit.

## 6. Reguli START

1. UID-ul este obligatoriu.
2. Se rezolva employee prin `userUid`; fallback exact pe `fullName`, apoi backfill UID best-effort.
3. Admin/dispecer fara employee este refuzat; tehnicianul poate continua fara employeeId.
4. Se verifica timesheet si cereri aprobate CO/CFP/CM/IN; DEL nu blocheaza.
5. Se verifica numai daca minutul START cade intr-un interval existent.
6. Weekendul/sarbatoarea necesita confirmarea UI; confirmarea este snapshot in sesiune. Storage-ul nu demonstreaza o respingere server-side independenta.
7. Intarzierea este `floor` minute dupa startul programului; sosirea devreme produce zero.
8. GPS: geofence Haversine la 50 m. Kiosk foloseste coordonate office fallback daca GPS esueaza; field card blocheaza.
9. Kiosk password pentru employee exista in cod, dar `KIOSK_EMPLOYEE_PASSWORD_ENABLED=false`; parola kiosk este folosita la iesirea din mod.
10. Selfie kiosk obligatoriu; field optional.
11. Tranzactia verifica lock-ul si sesiunea referita, apoi creeaza sesiunea si lock-ul.
12. Dublu START sanatos/concurent: unul castiga, al doilea este refuzat. `ACTIVE_UNLOCKED` permite insa o a doua sesiune.

Mesajele exacte pot varia intre wrapper-ele UI; storage emite erori precum sesiune activa, concediu aprobat sau suprapunere. Observatia live a controalelor si a fluxului este `[CONFIRMATĂ_LIVE_READ_ONLY]`; protectia efectiva server-side depinde si de rules/deploy `[NECONFIRMATĂ_DEPLOYMENT]`.

## 7. Reguli STOP

1. Sesiunea trebuie sa existe si sa fie `active`.
2. Minimum 60 secunde, cu mesaj ce include timpul ramas; automatizarile pot seta bypass.
3. Kiosk cere selfie, field il permite optional.
4. GPS/mode/checkOut location sunt salvate conform caller-ului.
5. `sessionEnd` este clamp-uit de regula de sesiune uitata: un final cerut dupa ziua START devine programEnd din ziua START daca este dupa START, altfel 23:59:59.999.
6. Tranzactia reciteste sesiunea si lock-ul. Lock potrivit se sterge; lock absent nu blocheaza; lock diferit spre alta sesiune activa blocheaza.
7. Dublu STOP simultan: dupa retry, unul reuseste, unul vede sesiunea inchisa.
8. STOP fara sesiune: `Session not found`; STOP dupa refresh functioneaza prin lock/query; expirarea sesiunii browserului impiedica caller-ul autentificat, dar nu modifica documentul attendance.
9. Dupa commit se incearca sync client; esecul sync nu redeschide attendance.

## 8. Automatizari

| Automatizare | Activare/configurare | Frecventa/TZ | Efect si idempotenta |
|---|---|---|---|
| `ensureAutoCheckInFromFirstQr` | apelat pentru tehnician la primul QR | event client, limite de zi in timezone browser | numai fara active si fara orice pontaj in zi; creeaza field/auto; lock tranzactional limiteaza cursa |
| auto checkout raport semnat | apelat dupa semnatura beneficiar | event client | `AUTO_CHECKOUT_ENABLED=false`, deci nu inchide `[CONFIRMATĂ_PRIN_COD]` |
| `autoCheckOutScheduleGrace` | `AUTO_CHECKOUT_ENABLED=false` in Functions | `*/15 17-18 * * *`, Europe/Bucharest | inactiv in cod; daca activat ar inchide dupa end+30, fara stergere lock |
| `autoStopAttendanceSessions` | `AUTO_EOD_STOP_ENABLED=true` | `59 23 * * *`, Europe/Bucharest | inchide tranzactional fiecare sesiune, completeaza extra logs si sterge numai lock-ul care indica sesiunea inchisa |
| `onAttendanceCheckoutSync` | trigger update attendance | eveniment Firestore, conversie explicita Bucharest | sync numai la tranzitia non-completed -> completed; erorile sunt prinse, deci nu sunt relansate pentru retry automat |

Clientul considera mai multe statusuri `lucrari` drept neterminate si ziua curenta; Functions verifica numai statusul exact `"In lucru"`/forma din cod, fara aceeasi filtrare temporala. Comportamentul potential al auto-checkout este `[CONTRADICTORIE]`, dar deploy-ul este nerelevant cat timp fanionul ramane fals.

## 9. Fus orar si granite calendaristice

- Firestore Timestamp este instant absolut; `serverTimestamp` este ora serverului, nu ora afisata.
- conversia attendance -> `HH:mm` este explicit `Europe/Bucharest`.
- dashboardul, primul QR, sync-ul client bulk/single si unele verificari START folosesc `Date` local din browser/runtime pentru limitele zilei.
- Functions foloseste `Europe/Bucharest` pentru cron si are helper de granite zonate pentru sync.
- browserul live analizat a rulat in `Europe/Bucharest`. `[CONFIRMATĂ_LIVE_READ_ONLY]`
- documentul lunar este ales dupa ziua locala a sync-ului; clientul intr-un alt timezone poate selecta alta zi/luna decat formatterul entry-ului. `[DEDUSĂ_DIN_COD]`
- februarie/an bisect: `new Date(y,m,0).getDate()` produce 28/29 corect; month key invalid revine la 31 in sumar.
- 23:59 este capatul maxim folosit pentru overtime; 00:00 din ziua urmatoare este cross-day.

### 9.1 Ture peste miezul noptii

- Attendance poate primi un end ulterior, dar `createCheckOut` il clamp-uieste la programEnd din ziua START (daca programEnd > start) sau la finalul zilei START.
- Cronul EOD inchide in ziua START.
- Sesiunea nu este impartita in doua documente/zile.
- Sync single filtreaza dupa `sessionEnd` in ziua tinta, in timp ce bulk/dashboard interogheaza dupa `sessionStart`; aceasta diferenta poate omite sau atribui diferit o sesiune cross-day ne-clamp-uita legacy. `[CONTRADICTORIE]`

### 9.2 DST demonstrat pentru 2026 si remediat

- 29 martie 2026: `00:30Z -> 01:30Z` se afiseaza `02:30 -> 04:30`, dar `startTimestampMs/endTimestampMs` pastreaza durata de 60 minute.
- 25 octombrie 2026: ambele capete se pot afisa `03:30`, dar timestampurile absolute pastreaza durata de 60 minute.

Entry-urile Pontaj noi stocheaza atat `HH:mm`, cat si timestampurile absolute; `calcEffectiveMinutes` corecteaza unirea wall-clock cu unirea absoluta. Entry-urile legacy fara timestamp necesita resincronizare. `[CONFIRMATĂ_PRIN_COD]`

## 10. Sincronizare attendance -> hrTimesheets

### 10.1 Client

1. Selecteaza sesiuni completed pentru utilizator/zi.
2. Rezolva employee: hint `employeeId`, UID, nume normalizat.
3. Formateaza intervalele in Bucharest.
4. Protejeaza CO/CFP/CM/IN.
5. Elimina Pontaj/traseu vechi, pastreaza manualele, adauga noile intrari.
6. Elimina integral intrarile generate care se suprapun intre ele.
7. Calculeaza `hours` pe unirea manual + Pontaj minus pauza.
8. Pastreaza DEL/WE/SL, altfel WORK; scrie ziua cu `set(..., merge:true)`.

### 10.2 Trigger Functions

Triggerul oglindeste acum algoritmul client:

- pastreaza intrarile manuale valide;
- pastreaza toate dovezile Pontaj valide, inclusiv suprapunerile;
- calculeaza `hours` din unirea listei finale `manual + Pontaj`;
- persista timestampurile absolute pentru calcul DST-safe.

Exemplu: manual `08:00-12:00`, Pontaj `10:00-16:00`, fara pauza:

- client: entries ambele, `hours=8` (union 08-16);
- Functions: acelasi rezultat, entries ambele si `hours=8`.

Scrierile raman last-write-wins la nivel Firestore, dar cele doua implementari produc acelasi continut pentru acest caz. `[CONFIRMATĂ_PRIN_COD]`

## 11. De ce ecranele pot afisa valori diferite

1. Dashboardul, condica, profilul si raportul folosesc acum calculul efectiv comun; dashboardul nu include insa intrari exclusiv manuale din condica.
2. Durata individuala a unei sesiuni din tabelul dashboard ramane durata elapsed; KPI-ul este totalul efectiv grupat.
3. WORK fara `hours` si fara entries valoreaza 0 pe toate suprafetele.
4. Sumarul avansat recalculeaza pauza si unirea, dar C1-C7/traseul folosesc sume brute ale entry-urilor.
5. Banca si diferenta folosesc programul net individual/default.
6. Client sync si Functions folosesc aceeasi lista finala si aceeasi formula pentru Pontaj.
7. Sync client poate folosi granitele timezone-ului browserului; Functions foloseste Bucharest.
8. Dashboardul selecteaza dupa `sessionStart`; sync single filtreaza dupa `sessionEnd`.

## 12. Contradictii, necunoscute si riscuri

| Tema | Clasificare | Consecinta |
|---|---|---|
| merge manual + Pontaj client vs Functions | `CONFIRMATĂ_PRIN_COD` | implementari aliniate pe unirea listei finale |
| calcul cereri client union/intersectie vs Functions suma bruta | `CONTRADICTORIE` | cererea poate materializa alt total |
| dashboard KPI vs condica net | `CONFIRMATĂ_PRIN_COD` | ambele folosesc calcul efectiv; manualele exista numai in condica |
| `hours` lipsa | `CONFIRMATĂ_PRIN_COD` | valoare comuna 0 |
| timezone browser vs Bucharest | `CONTRADICTORIE` | zi/luna diferita pentru browser extern |
| DST pentru Pontaj | `CONFIRMATĂ_PRIN_COD` | timestampurile absolute pastreaza durata reala; legacy cere resync |
| lock dupa cron | `CONFIRMATĂ_PRIN_COD` | lock-ul potrivit este sters in aceeasi tranzactie |
| fallback pe nume | `NECONFIRMATĂ_BUSINESS` | omonime si atasare gresita |
| norma bancii | `CONFIRMATĂ_PRIN_COD` | program individual -> defaults -> fallback, minus pauza configurata |
| fanioane si deploy live Functions | `NECONFIRMATĂ_DEPLOYMENT` | codul local nu demonstreaza versiunea deployata |
| rules permissive observate in inventar | `NECONFIRMATĂ_DEPLOYMENT` | garantiile tranzactiilor nu inlocuiesc autorizarea server-side |

## 13. Functionalitati neverificate in aceasta etapa

- Nu s-au creat sesiuni, cereri sau angajati pentru a proba scrierile live.
- Nu s-a fortat executia cronurilor live si nu s-a verificat versiunea exacta deployata a Functions.
- Nu s-au testat concurent doua dispozitive reale; concluziile provin din semantica tranzactiilor si cod.
- Nu s-au verificat intentiile HR pentru `zileLucrate`, norma fixa de 8h, fallback-ul pe nume sau eticheta „ore lucrate”.
- Nu s-a demonstrat un retry automat pentru sync: triggerul prinde erorile si nu le relanseaza.

Vectorii executabili conceptual si oracolele numerice sunt in `docs/pontaj/01-vectori-test.md`.

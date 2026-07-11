# Inventar aplicație - modul Pontaj

Data analizei: 10 iulie 2026  
Aplicație live: `https://fom-nrg.vercel.app`  
Metodă: analiză statică a workspace-ului curent și explorare read-only în Chromium prin Playwright, cu stările de autentificare E2E existente (`admin`, `tehnician`, `kiosk`).

## 1. Domeniu, limite și niveluri de certitudine

Au fost analizate toate rutele cerute, plus componentele și fluxurile externe care le alimentează: pontarea din `/dashboard/lucrari`, primul QR, raportul semnat și funcțiile Firebase de depontare/sincronizare.

În această analiză:

- **Cod** înseamnă comportament demonstrat în sursa locală curentă.
- **Live** înseamnă comportament observat în aplicația Vercel la data analizei.
- **Neverificat** înseamnă că acțiunea ar fi produs scrieri, ar fi necesitat un rol/situație indisponibilă sau ar fi implicat efecte externe. Nu a fost executată.

Nu au fost trimise formulare, nu s-au apăsat Start/Stop, sincronizare, salvare, export sau confirmări destructive. Nu au fost scrise teste Playwright. Explorarea browserului a folosit comenzi temporare, fără fișiere de test în repository.

Limită importantă: workspace-ul și versiunea Vercel nu au fost corelate printr-un build SHA vizibil. Constatările de cod descriu workspace-ul curent; constatările live sunt marcate separat.

## 2. Control acces și redirectări comune

### Protecții comune

- `app/dashboard/layout.tsx` învelește toate rutele `/dashboard/**` în `ProtectedRoute` fără listă de roluri: este necesar un utilizator Firebase autentificat.
- `app/dashboard/resurse-umane/layout.tsx` adaugă `allowedRoles=["admin", "dispecer"]` pentru toate rutele HR.
- `app/kiosk/layout.tsx` adaugă `allowedRoles=["kiosk"]` pentru `/kiosk`.
- `ProtectedRoute` rulează client-side. În loading afișează spinner și „Se încarcă...”. Fără utilizator trimite la `/login`. Un rol nepermis este trimis la `/dashboard`.
- Rolul `tehnician` trimis la `/dashboard` este redirecționat mai departe la `/dashboard/lucrari`; rolul `kiosk` este ținut în `/kiosk`; rolul `client` este limitat la portal și la rutele explicit permise.
- `DepartamentePage` are încă o verificare în pagină: numai `admin`; un `dispecer` vede „Acces restricționat”.

### Matrice acces

| Rută | Admin | Dispecer | Tehnician | Kiosk | Neautentificat |
|---|---:|---:|---:|---:|---:|
| `/dashboard/resurse-umane/pontaj` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/pontaj/dashboard` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/pontaj/sync` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/condica-prezenta` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/salariati` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/salariati/[id]` | da | da | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/departamente` | da | pagină „Acces restricționat” | redirect | redirect | `/login` |
| `/dashboard/resurse-umane/rapoarte` | da | da | redirect | redirect | `/login` |
| `/dashboard/kiosk` | nu ca pagină finală; redirect `/kiosk`, apoi `/dashboard` | idem | idem | `/kiosk` | `/login` |
| `/kiosk` | redirect `/dashboard` | redirect `/dashboard` | redirect `/dashboard`, apoi `/dashboard/lucrari` | da | `/login` |

Live: accesarea condicii cu rolul tehnician a ajuns la `/dashboard/lucrari`; accesarea `/kiosk` cu tehnician a ajuns tot la `/dashboard/lucrari`. `/dashboard/kiosk` cu admin a ajuns la `/dashboard`. Aceste rezultate confirmă protecția client-side observabilă.

## 3. Inventarul rutelor

### 3.1 `/dashboard/resurse-umane/pontaj`

**Scop.** Alias de compatibilitate pentru condică. Nu are UI propriu.

**Comportament.** Server component care păstrează toți parametrii query și execută `redirect('/dashboard/resurse-umane/condica-prezenta?...')`.

**Date/API/acțiuni.** Nu încarcă și nu scrie date direct. Toate componentele, acțiunile și efectele sunt cele ale condicii după redirect.

**Live.** Redirectul la `/dashboard/resurse-umane/condica-prezenta` a fost confirmat. Într-o primă observație de numai 2,5 secunde era încă vizibil loading; după 6 secunde redirectul și condica erau complete.

### 3.2 `/dashboard/resurse-umane/pontaj/dashboard`

**Scop.** Monitorizarea sesiunilor brute de pontaj pentru o singură zi și calcularea unor statistici direct din `attendance`.

**Date la deschidere.** Data curentă; query Firestore în `attendance` cu `sessionStart >= începutul zilei`, `sessionStart <= sfârșitul zilei`, ordonare descrescătoare. Pentru eticheta salariatului citește `hrEmployees/{employeeId}`; dacă lipsește `employeeId`, caută `hrEmployees where userUid == attendance.userId limit 1`.

**Componente.** Calendar în popover, patru carduri KPI și tabel de sesiuni.

**Controale și filtre.** Un singur selector calendaristic de dată. Nu există căutare, sortare interactivă, paginare, dropdown contextual, export, form sau acțiuni de modificare.

**Afișare.** KPI: Total Sesiuni, Active Acum, Ore Lucrate, Ore Extra. Tabel: Tehnician, Mod, Check-In, Check-Out, Durată, Timp Extra, Locație, Status. Orele sunt afișate cu `formatAttendanceTimeHHmm` în `Europe/Bucharest`.

**Stări.** Loading cu spinner; empty „Nu există pontaje pentru această zi”. Eroarea este doar `console.error`, fără alertă/toast vizibil. Nu există stare disabled în afara comportamentului calendarului.

**Efect DB.** Read-only. Schimbarea datei relansează query-ul. Nu recalculează și nu sincronizează condica.

**Live.** Pentru 10.07.2026 au fost observate 4 sesiuni, 2 active, 18h lucrate și 0h extra. Tabelul a arătat sesiuni office/field, locații și stări active/finalizate. Nu au existat erori console în probă.

### 3.3 `/dashboard/resurse-umane/pontaj/sync`

**Scop.** Sincronizare manuală `attendance -> hrTimesheets`, pentru o zi sau un interval, plus verificarea sumară a statusului.

**Date la deschidere.** Nu face query până la acțiunea utilizatorului. Inițializează data unică la azi; start/end interval sunt necompletate.

**Componente și formulare.** Două carduri: „Sincronizare Zilnică” și „Sincronizare Interval”. Trei calendare în popover: zi, start, sfârșit. Secțiune informativă statică.

**Acțiuni.** `Sincronizează`, `Verifică Status`, `Sincronizează Intervalul`.

**Validări.** Pentru interval sunt obligatorii ambele date, iar start trebuie să fie înainte sau egal cu end. Toasturi: „Date Invalide”, „Sincronizare Reușită”, „Eroare”.

**Stări.** Toate acțiunile folosesc același `loading`; butoanele sunt disabled și afișează spinner/text de procesare. Statusul afișează sincronizat/nesincronizat, numărul de sesiuni și `lastSyncAt` dacă există. Nu există paginare, sortare, căutare sau export.

**Efect DB.** `syncAttendanceToTimesheet(date)` citește sesiunile `attendance` finalizate din zi, grupează după `userId`, rezolvă `employeeId`, citește pauza implicită și scrie batch în `hrTimesheets/{employeeId}_{YYYY-MM}` la `days.{day}`, plus `employeeId`, `monthKey`, `updatedAt=serverTimestamp()`. Intervalul repetă secvențial operația pentru fiecare zi. Statusul citește `attendance` și toate `hrTimesheets` din lună; nu este un jurnal de sincronizare real.

**Live.** Au fost observate toate cele trei butoane și datele implicite; nicio sincronizare nu a fost executată.

### 3.4 `/dashboard/resurse-umane/condica-prezenta`

**Scop.** Registrul lunar consolidat: vizualizare, editare manuală, cereri HR, sărbători, export și re-sincronizare.

**Date la deschidere.** Subscrieri real-time la:

- `hrEmployees`, ordonat după `nume`, apoi filtrat la activi;
- `hrTimesheets where monthKey == luna selectată`;
- `hrRequests`, ordonat după `createdAt`, filtrat client-side la lună și tipurile CO/CFP/CM/DEL/IN;
- `hrDepartments`, ordonat după nume;
- `hrSettings/defaults`;
- `hrHolidays/{year}`;
- `attendance where status == active`;
- `hrEmployees where userUid == currentUser.uid` pentru identitatea proprie.

La mount apelează `seedHrIfEmpty`. Într-o bază cu HR gol, simpla deschidere poate crea seed-uri în `hrEmployees` și `hrTimesheets`; în mediul live observat existau date, deci nu s-a activat această ramură.

**Componente.** `TimesheetGrid`, `TimesheetListView`, `TimesheetLegend`, `DayEntryPopover`, `AddDayEntryDialog`, `DeleteTimesheetDialog`, `LegalHolidaysDialog`, `LeaveRequestsSection`, `CreateLeaveRequestDialog` și dialogul „Editează cererea aprobată”.

**Filtre/perioadă/vizualizare.** Input lună; select salariat; mod Grid/Listă; Compact/Detaliat memorat în `localStorage` (`condica-compact-mode`). Nu există paginare. Salariații sunt sortați alfabetic. Gridul afișează zilele lunii și coloane sumarizate.

**KPI.** Ore lucrate luna, angajați activi azi, în concediu CO, peste/sub normă și medie ore/angajat. Fiecare are tooltip cu formula. Coloanele extinse includ zile lucrate, tichete masă, ore prezență/efective, bancă ore, trasee, CO, DEL, IN, sărbători și C1-C7.

**Acțiuni globale.** Vezi/închide legendă; schimbă view; compact; sărbători legale; re-sincronizează ieri; export CSV; șterge; adaugă; schimbă luna/salariatul.

**Dialog/popover zi.** Afișează cod, total, pauză manuală sau implicită, intervale, metode Play/Stop, proiect, întârziere și selfie Start/Stop pentru admin/dispecer. Oferă Verificări pontaj, Curăță intervale, adaugă interval, editare, ștergere și deschiderea dialogurilor globale. Pentru CO poate elimina codul după `window.confirm`, apoi marchează cererea în `hrRequests` cu audit de curățare.

**Dialog Adaugă condică.** Salariat, start/end date, unul sau mai multe intervale, proiect, flag „Traseu la client”, pauze multiple și opțiuni de includere pentru concediu, evenimente, sărbători și weekend. Validează ore HH:mm, start < end, intervale/pauze nesuprapuse, pauze în interiorul programului, aceeași lună și suprapuneri cu date existente. Scrie secvențial `hrTimesheets/{employeeId}_{monthKey}.days.{day}`.

**Dialog Șterge pontajul.** Salariat, interval de date, checkbox timp înregistrat și pauză. Submit disabled până la completarea datelor și alegerea a cel puțin unui tip. Dacă ambele sunt selectate șterge ziua; altfel șterge numai `entries` sau `breaks`, folosind `deleteField()`. Nu are un al doilea dialog de confirmare după butonul principal.

**Sărbători legale.** Draft local cu dată și denumire, add/edit/delete; validări pentru dată, an și duplicate. Numai `Salvează` scrie `hrHolidays/{year}` cu `year`, `items`, `updatedByUid`, `updatedAt`.

**Cereri HR.** Listă pentru lună, creare cerere și export DOCX. Editarea unei cereri aprobate actualizează `hrRequests/{requestId}` și apoi reface celulele afectate prin `syncHrRequestToTimesheets`; toastul raportează actualizate/șterse/sărite.

**Export.** CSV generat client-side din luna, salariații filtrați, timesheet-uri, cereri, sărbători și defaults. Nu scrie Firestore.

**Stări.** Subscrierile nu au un loading global explicit pentru grid; golul produce rânduri fără date. Erorile majorității subscrierilor sunt ignorate sau numai logate. Toasturi există pentru validări, sincronizare, sărbători, editări și erori. Acțiunile de salvare au disabled/spinner local.

**Efecte asupra altor pagini.** Orice modificare `hrTimesheets` se propagă în fișa salariatului, rapoarte și sumarurile condicii prin `onSnapshot`. Modificarea cererilor se propagă în concedii și rapoarte overtime. Sărbătorile afectează calculul și clasificarea SL/C7.

**Live.** Pentru iulie 2026 au fost observate 227h, 2 activi azi, 0 CO, +27h și media 22,7h, plus rânduri active „În lucru”. Dialogul Sărbători a arătat 2 zile. Adăugările/ștergerile făcute în probă au rămas numai în draftul dialogului; `Salvează` nu a fost apăsat.

### 3.5 `/dashboard/resurse-umane/salariati`

**Scop.** Administrarea salariaților, legarea cu utilizatorii și configurarea programului/pauzei globale sau individuale.

**Date la deschidere.** `hrEmployees` real-time; `hrDepartments` real-time; `hrSettings/defaults` real-time; citire completă `users`; verificare localStorage legacy; posibil `seedHrIfEmpty` dacă HR este gol.

**Componente.** Card Program standard, card Pauză standard, `EmployeesTable`/`DataTable`, `EmployeeEditDialog`, alert dialog pentru propagarea defaults și panou de import legacy condițional.

**Listă.** Coloane Nume, Funcție, Status și acțiuni Fișă/Editează. Sortare pe coloane, căutare/filtrare oferite de DataTable, paginare client-side, page size 10/20/50/100. Empty: „Nu există date disponibile”. Loading: „Se încarcă…”. Live au fost observate 12 înregistrări și paginarea 1-12.

**Program standard.** Patru inputuri HH:mm: program start/end, pauză start/end. Blur normalizează valori precum `8` la `08:00`; invalidul produce toast. `Salvează` deschide confirmarea cu două opțiuni:

- „Doar program standard”: scrie `hrSettings/defaults`, apoi completează numai programele/pauzele lipsă în `hrEmployees`;
- „Aplică tuturor salariaților”: scrie defaults și suprascrie programul/pauza tuturor salariaților în batch-uri.

**Dialog salariat.** Poză profil, prenume, nume, funcție, utilizator asociat, activ, CNP/CI, poziție COR, superior, departamente multiple, șef per departament, loc de muncă, program, pauză și zile concediu. Validări: nume/prenume obligatorii; HH:mm valid; pauza completă în pereche. Nu este validat explicit că program start < end sau pauză start < end în acest dialog.

**Scrieri salariat.** `hrEmployees/{employeeId}` cu toate câmpurile din formular, `fullName`, `updatedAt` și `createdAt`, ambele `serverTimestamp()`, prin merge. Observație: `createdAt` este rescris și la editare. Poza se scrie/șterge în Storage înaintea documentului; lipsa salvării nu aplică poza.

**Import legacy.** Dacă localStorage conține cheile vechi, importă batch în `hrEmployees`/`hrTimesheets`, apoi curăță localStorage. Nu a fost prezent/verificat live.

**Live.** Dialogul „Adaugă salariat” și toate câmpurile de mai sus au fost observate fără submit. Programul live era 08:30-17:00 și pauza 12:30-13:00.

### 3.6 `/dashboard/resurse-umane/salariati/[id]`

**Scop.** Fișă individuală cu detalii, asociere utilizator, pontaj lunar și concedii/evenimente.

**Date.** `hrEmployees/{id}`, utilizatori, departamente, `hrSettings/defaults`, `hrTimesheets/{id}_{month}`, cereri `hrRequests where employeeId == id`; parametru query `month`. Identitatea și drepturile vin din `AuthContext`.

**Componente și navigare.** Header cu Înapoi/Editează; taburi Detalii generale, Pontaj, Concedii și evenimente; `EmployeeEditDialog`; `CreateHrRequestDialog`.

**Detalii.** Informații personale/profesionale, departamente, superiori, program, pauză, asociere utilizator și rezumat rapid. Butoane pentru editare, deschiderea Utilizatori și salt la tabul Pontaj.

**Pontaj.** Selector lună sincronizat în URL; KPI ore, CO, SL, WE, DEL; calendar lunar colorat; acțiuni „Deschide condica completă” cu `employeeId`/`month` și „Vezi rapoarte”. Este read-only față de `hrTimesheets` pe această pagină.

**Concedii.** Sold anual, consumate, rămase, istoric cereri, export DOCX și ștergerea cererilor pending pentru rolurile permise. Dialogul cererii include salariat, sector/departament, tip CO/CFP/CM/DEL, perioadă, motiv; DEL cere client, CM cere document medical. Submit rămâne disabled până la câmpurile obligatorii.

**Stări.** Loading; „Salariat inexistent”; empty pentru cereri; disabled în timpul ștergerii/salvării. Toasturi pentru asociere, salvări și erori. Ștergerea unei cereri pending folosește confirmare `window.confirm` în cod.

**Efect DB.** Editarea scrie `hrEmployees/{id}`. Asocierea/dezasocierea modifică `userUid` în salariat. Crearea cererii scrie `hrRequests/{newId}` și tranzacționează `hrCounters/leaveRequestSerial`; poate încărca document CM în Storage și notifică prin API. Ștergerea pending șterge documentul cererii.

**Live.** Pentru fixture-ul `emp_822f...` a fost observată fișa „Tehnician Test”, utilizator asociat, departamentul Operational, program 08:30-17:00, pauză 12:30-13:00 și rezumat 15,28h.

### 3.7 `/dashboard/resurse-umane/departamente`

**Scop.** CRUD pentru departamente și desemnarea șefului de departament.

**Date.** `hrDepartments` real-time ordonat după nume și citire completă `users` pentru dropdown manager.

**UI.** Tabel Nume, Descriere, Șef, Status, Acțiuni. Fără căutare, paginare sau sortare interactivă. Loading „Se încarcă...”; empty cu „Creează departament”; eroarea produce toast.

**Acțiuni/dialoguri.** Adaugă, editează, activează/dezactivează imediat, șterge cu `AlertDialog`. Formular: nume obligatoriu, descriere, șef, status activ. Butoanele sunt disabled pe durata salvării/ștergerii.

**Scrieri.** `hrDepartments/{deptId}` cu `name`, `description`, `managerUid`, `active`, `createdBy`, `updatedAt=serverTimestamp()` și `createdAt` numai la creare. Ștergerea verifică mai întâi `hrEmployees where sectorIds array-contains departmentId`; dacă există asocieri, refuză. Toggle scrie prin același merge.

**Efecte.** Departamentele active apar în formularul salariatului și în cereri; `managerUid` este propunere pentru `managerUidBySector`, nu o regulă automată garantată după salvarea salariatului. Dezactivarea ascunde opțiunea din formular, dar nu elimină asocierile existente.

**Live.** Adminul a văzut 7 departamente și formularul complet. Confirmarea de ștergere nu a fost executată. Accesul dispecerului este demonstrat numai din cod, neexistând storage state dispecer separat.

### 3.8 `/dashboard/resurse-umane/rapoarte`

**Scop.** Rapoarte de pontaj și reconciliere a orelor suplimentare.

**Tab Pontaj HR.** Citește salariați activi și timesheet-uri pe lună; selector lună; KPI ore totale, medie, CO/SL, WE; două grafice sortate descrescător după ore. Nu are export, căutare, paginare sau empty/error explicit. `seedHrIfEmpty` poate scrie dacă HR este gol.

**Tab Ore Suplimentare.** Citește `hrEmployees`, `hrSettings/defaults`, `hrRequests where kind == ADD_OVERTIME orderBy createdAt desc` și `hrTimesheets` pentru una sau 12 luni. Filtre: an, lună, salariat, status cerere, toate/doar probleme. Taburi interne sumar/detaliu/reconciliere, carduri, grafice, expandare per salariat. Exporturi CSV sumar, detaliat și reconciliere; ultimul este disabled fără rânduri. Loading are spinner; erorile de subscriere sunt logate și pot lăsa rezultate goale.

**Efect DB.** Read-only; exporturile sunt client-side.

**Live.** Tabul Pontaj HR a afișat pentru iulie 2026: 226,92 ore, medie 22,7, CO/SL 15/0 și WE 0. Schimbarea la overtime nu a fost finalizată în ultima probă DOM, dar structura și controalele sunt demonstrate în cod și în spec-ul read-only existent.

### 3.9 `/dashboard/kiosk`

**Scop.** Alias legacy.

**Comportament.** Execută server-side `redirect('/kiosk')`. Apoi `/kiosk` impune rolul kiosk. Pentru admin live, rezultatul final a fost `/dashboard`; pentru un cont kiosk ar rămâne `/kiosk`.

**Date/acțiuni.** Niciuna proprie.

### 3.10 `/kiosk`

**Scop.** Pontare office pe un dispozitiv autentificat cu rol `kiosk`, pentru salariați eligibili.

**Date la deschidere.** `hrEmployees orderBy nume`; trei query-uri în `users` pentru rolurile `tehnician`, `admin`, `dispecer`; `hrHolidays/{year}` în componentă. Lista include numai salariați activi cu `userUid`, user eligibil și email; este deduplicată după UID și sortată după nume.

**UI/stări.** Loading fullscreen; error cu „Încearcă din nou”; empty „Nu sunt utilizatori eligibili”; ecran principal Start/Stop; selecție salariat; procesare; succes. Live au fost observate Start/Stop și lista eligibilă.

**Flux.** Start/Stop -> salariat -> citire sesiune activă -> dialog pentru tură deja pornită/lipsă -> confirmare zi specială -> verificare parola salariatului -> selfie obligatoriu -> GPS -> determinare office/field -> `createCheckIn`/`createCheckOut`. Există dialog separat de logout kiosk cu parola contului kiosk și confirmare finală.

**Validări/toasturi.** User/email lipsă, parolă greșită, concediu, suprapunere condică, tură activă/lipsă, selfie/cameră, GPS, regula minimă de 60 secunde, sync fără salariat sau zi protejată. Acțiunile sunt disabled în timpul verificării/procesării.

**Selfie.** Se încarcă la `attendance/selfies/{selectedUserUid}/{sessionId}/{checkin|checkout}-{timestamp}.jpg`; URL/path/status sunt salvate în sesiune. Codul numește mecanismul „face recognition”, dar fluxul curent folosește un audit ID/selfie și nu demonstrează un motor biometric real.

**Live.** Rolul kiosk a văzut „Sistem Pontaj”, Start și Stop. Lista Start a inclus tehnicieni, admin și dispecer eligibili. Nu a fost selectat intenționat un salariat și nu s-a ajuns la verificare/selfie; o apăsare pe butonul de logout a deschis doar dialogul local, care a fost abandonat fără parolă.

## 4. Inventarul componentelor și dialogurilor

| Componentă | Rol în pontaj | Date/scrieri principale |
|---|---|---|
| `ProtectedRoute` | autentificare și roluri | citește AuthContext; redirect client-side |
| `FieldCheckInCard` | Start/Stop în dashboardul tehnicianului | `attendance`, lock, selfie Storage, sync condică |
| `KioskCheckIn` | Start/Stop pentru roster kiosk | aceleași sesiuni; verificare parolă selectat |
| `SelfieCapture` | captură cameră | blob încărcat în Storage de componenta părinte |
| `TimesheetGrid` | condică lunară densă | read-only; emite click pe celulă |
| `TimesheetListView` | alternativă listă | read-only; emite click pe celulă |
| `DayEntryPopover` | detaliu/edit zi, selfie, verificări | `hrTimesheets`; opțional audit `hrRequests` |
| `AddDayEntryDialog` | adăugare manuală pe interval | callback către upsert timesheet |
| `DeleteTimesheetDialog` | ștergere intervale/pauze | callback către update/deleteField |
| `LegalHolidaysDialog` | CRUD draft sărbători | salvează `hrHolidays/{year}` |
| `LeaveRequestsSection` | listă și DOCX | citește cereri; navigare/apel create |
| `CreateLeaveRequestDialog` | cerere CO/CFP/CM/DEL | `hrRequests`, counter, Storage CM |
| `EmployeeEditDialog` | configurare salariat/program | `hrEmployees`, Storage profil |
| `EmployeesTable`/`DataTable` | listă, sort, paginare | read-only; navigare/edit callback |
| `HrTimesheetReport`/`TimesheetCharts` | KPI/grafice | `hrEmployees`, `hrTimesheets` |
| `OvertimeReport` | overtime/reconciliere/export | `hrRequests`, `hrTimesheets`, defaults |

Dialoguri identificate: Adaugă/Editează salariat; Zoom poză; Aplicăm programul la toți; Departament nou/Editează; Confirmare ștergere departament; Adaugă condică; Șterge pontajul; Sărbători legale; Detaliu zi; Editare interval; Selfie Start/Stop; Verificări pontaj; Editare cerere aprobată; Cerere HR nouă; Pontaj deja pornit; Nu există tură activă; Confirmare Start/Stop; Confirmare parolă; Selfie pontaj; Deconectare kiosk.

## 5. Inventarul surselor de date

| Colecție/document | Identificator | Câmpuri relevante | Consumatori |
|---|---|---|---|
| `users/{uid}` | Firebase Auth UID | role, email, displayName, isKioskMode | auth, roster kiosk, asociere salariat |
| `hrEmployees/{employeeId}` | `emp_*`/ID existent | identitate, active, `userUid`, program, pauză, `sectorIds`, `managerUidBySector` | toate paginile HR, pontare, sync |
| `hrDepartments/{departmentId}` | `dept_*`/ID existent | name, managerUid, active, timestamps | salariat, cereri, departamente |
| `hrSettings/defaults` | fix `defaults` | program/pauză globale, updatedAt | salariați, pontare, calcul, sync |
| `attendance/{sessionId}` | `att_{userId}_{startMs}` | sesiune brută, moduri, locații, selfie, status, program snapshot | dashboard pontaj, condică activă, sync |
| `attendanceActiveSessions/{userId}` | UID | activeSessionId, sessionStart, employeeId, updatedAt | lock unic Start/Stop |
| `hrTimesheets/{employeeId}_{YYYY-MM}` | employee + lună | employeeId, monthKey, `days.{day}`, updatedAt | condică, profil, rapoarte |
| `hrRequests/{requestId}` | auto-ID | employee/requester/sector/manager, kind/status/payload/audit | concedii, condică, overtime |
| `hrCounters/leaveRequestSerial` | fix | contor documente | creare cerere |
| `hrHolidays/{year}` | anul | items, updatedByUid, updatedAt | zi specială, condică, calcule |
| `logs/{id}` | auto-ID | categorie Pontaj, acțiune, metadata | audit Play/Stop/sync/fallback |
| `lucrari/{id}` | tichet | tehnicieni, status, data intervenție | auto Start primul QR, gate auto Stop |
| Storage selfie | path per user/session | JPEG + download URL | audit în condică |
| Storage profil/CM | path specific | fotografie/document | fișă/cerere medicală |

Nu există server actions în rutele inventariate. Accesul este predominant Firebase Web SDK direct din client. API relevant: `/api/reverse-geocode`; notificarea cererilor folosește endpointuri de email din implementarea HR. Funcțiile Firebase relevante sunt cron-urile și triggerul Firestore de sync.

## 6. Fluxul textual complet al pontării

```text
Admin creează/editează hrEmployees/{employeeId}
  -> leagă userUid (users/{uid})
  -> setează sectorIds / managerUidBySector
  -> setează programLucruStart/End și pauzaStart/End
     sau se folosesc hrSettings/defaults

Start din /kiosk sau FieldCheckInCard
  -> GPS + mod office/field + selfie + zi specială
  -> caută salariat după userUid; fallback legacy după fullName
  -> verifică CO/CFP/CM/IN și suprapunere în hrTimesheets
  -> calculează întârziere față de program start
  -> tranzacție:
       attendance/{att_uid_startMs} status=active
       attendanceActiveSessions/{uid}=lock
  -> log Pontaj Play

Stop din /kiosk sau FieldCheckInCard
  -> verifică minimum 60 secunde
  -> GPS + mod + selfie
  -> clamp pentru sesiune trecută peste zi
  -> tranzacție:
       attendance/{sessionId} status=completed + sessionEnd + checkout metadata
       șterge attendanceActiveSessions/{uid}
  -> log Pontaj Stop
  -> syncAttendanceUserDayToTimesheet(uid, ziua startului)

Trigger Firebase onAttendanceCheckoutSync
  -> observă tranziția la completed (manuală sau automată)
  -> recalculează idempotent aceeași zi în hrTimesheets

Sincronizare
  -> citește toate sesiunile completed ale userului/zii
  -> rezolvă employeeId
  -> transformă în entries HH:mm Europe/Bucharest
  -> păstrează intrările manuale non-Pontaj
  -> protejează CO/CFP/CM/IN
  -> deduce pauza manuală sau employee/default
  -> calcEffectiveMinutes -> hours rotunjit la 2 zecimale
  -> scrie hrTimesheets/{employeeId}_{YYYY-MM}.days.{day}

Consumatori real-time
  -> Condică: grid/listă/KPI/CSV
  -> Fișă salariat: calendar/KPI
  -> Dashboard pontaj: citește direct attendance, nu hrTimesheets
  -> Rapoarte: citește hrTimesheets (+ hrRequests/defaults)
```

## 7. Reguli demonstrate în cod

### Identificatori, sursă și timestampuri

- `userId` este UID-ul Firebase al persoanei pontate; `employeeId` este ID-ul `hrEmployees`.
- Sursa este demonstrată prin `mode`/`checkOutMode` (`office`/`field`) și `deviceInfo.type` (`kiosk`, `field`, `auto`).
- Sesiunea este `att_{userId}_{sessionStartMs}`. Lock-ul este `attendanceActiveSessions/{userId}`.
- `sessionStart/sessionEnd` sunt Firestore `Timestamp`; `createdAt/updatedAt` folosesc `serverTimestamp()` la scriere. `specialDayConfirmation.confirmedAt` este timestamp numeric client-side.
- Conversia HH:mm pentru condică este explicit `Europe/Bucharest`. Calendarul client folosește timezone-ul runtime-ului browserului; funcțiile programate folosesc `TIMEZONE` (configurat Europe/Bucharest în funcții).

### Program, întârziere și pauză

- Programul se ia din `hrEmployees`; fallback din `hrSettings/defaults`; fallback final 08:00-16:30.
- La Start, `lateStartMinutes=max(0, floor((now-scheduledStart)/60000))`; este informativ și se copiază în entry. Nu s-a găsit o penalizare automată.
- `calcEffectiveMinutes` unește intervalele de lucru suprapuse, calculează minutele și scade numai intersecția pauzei cu intervalele. Pauzele manuale valide au prioritate; altfel pauza individuală/default.
- Sync rotunjește orele la două zecimale.

### Blocaje și protecții business

- Un singur lock activ per UID; tranzacțiile revalidează lock/status.
- Stop manual este blocat în primele 60 secunde; depontarea automată poate sări regula.
- Start este blocat dacă ziua are CO/CFP/CM/IN aprobat sau un interval condică ce conține ora de Start.
- Sync nu suprascrie codurile CO/CFP/CM/IN. DEL/WE/SL pot păstra codul și primi intervale, conform merge-ului.
- Weekend/sărbătoare cere confirmare explicită înainte de Start și salvează tip, etichetă, dată și confirmedAt.

### Automatizări

- Primul QR poate apela `ensureAutoCheckInFromFirstQr`: numai dacă nu există sesiune activă și niciun pontaj în ziua locală; scrie `checkInAuto=true`, motiv `first_qr`.
- Depontarea la raport semnat există în cod, dar `AUTO_CHECKOUT_ENABLED=false`, deci este oprită.
- `autoCheckOutScheduleGrace` rulează la fiecare 15 minute în orele 17-18, dar este oprit de același kill-switch.
- `autoStopAttendanceSessions` rulează la 23:59 Europe/Bucharest și este activ (`AUTO_EOD_STOP_ENABLED=true`). Închide toate sesiunile active; pentru o sesiune veche facturează finalul programului din ziua de start, cu fallback 23:59 dacă finalul programului nu este după Start.
- `onAttendanceCheckoutSync` sincronizează orice tranziție la `completed`, inclusiv cron.

### Calcule condică/rapoarte

- Ore prezență/efective pentru WORK sunt intervale minus pauză; fallback la `cell.hours`, apoi 8 în unele sumarizări.
- Tichetul de masă crește pentru WORK cu ore > 0, numai în zile non-weekend/non-sărbătoare și fără cerere aprobată exclusivă.
- Banca de ore implementată este `orePrezenta - număr_zile_WORK * 8`, nu norma individuală din durata programului.
- C1-C7 sunt calculate în `timesheet-summary.ts`: traseu înainte de program, traseu după program, pontaj în afara programului în trepte de 2h, sâmbătă, duminică/sărbătoare. Formulele sunt demonstrabile în cod, dar semnificația juridică/business a codurilor C1-C7 nu este configurată în date.

## 8. Dependențe între pagini

- Salariați -> definește legătura UID, programul, pauza și departamentele necesare pontării/sync-ului.
- Departamente -> furnizează sectorul și managerul propus pentru cereri; nu schimbă retroactiv pontajele.
- Kiosk/Dashboard lucrări -> scriu `attendance`; dashboard pontaj citește imediat sesiunea brută.
- Stop/trigger/sync manual -> scriu `hrTimesheets`; condica, profilul și rapoartele se actualizează real-time.
- Cereri aprobate -> pot proteja Start-ul și celulele; sincronizarea cererii scrie coduri/intervale în timesheet.
- Sărbători -> afectează confirmarea Start, afișarea și C7/SL.
- Condica manuală -> poate bloca Start prin suprapunere și schimbă direct toate rapoartele bazate pe `hrTimesheets`, fără a modifica `attendance`.
- Dashboard pontaj și condica pot diferi temporar sau permanent: primul citește brut `attendance`; a doua citește materializarea `hrTimesheets`.

## 9. Riscuri identificate

1. **Critic - reguli Firestore locale complet deschise.** `firestore.rules` conține `allow read, write: if true` pentru orice document. Dacă acesta este ruleset-ul deployat, rolurile UI nu reprezintă securitate; orice client poate citi/scrie HR, pontaj, utilizatori și logs. Ruleset-ul efectiv deployat nu a fost citit în această etapă.
2. **Critic - fallback Storage larg.** Regula specifică selfie limitează read la admin/dispecer, dar fallback-ul permite read/write oricărui utilizator autentificat pentru orice path non-CRM; regulile Firebase se combină prin OR. Restricția selfie este astfel anulată dacă ruleset-ul este deployat.
3. **Ridicat - protecție de rută client-side.** Redirectul ascunde UI, dar securitatea reală depinde integral de Firebase Rules/API authorization.
4. **Ridicat - două implementări de sync.** Clientul și funcția `syncAttendanceUserDayAdmin` oglindesc manual algoritmul. Comentariul cere actualizare dublă; divergența poate produce ore diferite.
5. **Ridicat - sync bulk și sync trigger au merge diferit.** Triggerul filtrează suprapunerea cu intrări manuale; helperul client păstrează manualele și normalizează numai intrările calculate, ceea ce poate permite rezultate diferite în cazuri de overlap.
6. **Ridicat - simpla deschidere poate scrie seed.** Condica, salariații și rapoartele apelează `seedHrIfEmpty`; o pagină aparent read-only poate popula baza goală.
7. **Ridicat - fallback pe nume modifică salariatul.** La Start, maparea legacy după `fullName` încearcă să backfill-uiască `hrEmployees.userUid`. Pontarea poate deci modifica profilul HR.
8. **Mediu - `createdAt` salariat rescris la editare.** `createOrUpdateEmployee` setează mereu `createdAt=serverTimestamp()` cu merge.
9. **Mediu - erori UI insuficiente.** Dashboard pontaj și rapoarte loghează multe erori numai în consolă; utilizatorul poate vedea gol/zero fără explicație.
10. **Mediu - status sync aproximativ.** `getAttendanceSyncStatus` verifică existența unei zile în orice timesheet din lună, nu egalitatea tuturor sesiunilor și nici timestampul ultimului sync; poate raporta „synced” incomplet.
11. **Mediu - acțiuni HR pentru dispecer.** Layout-ul permite dispecerului aproape toate acțiunile condicii/salariaților, inclusiv editări și sync; numai Departamente este admin-only. Trebuie confirmat că aceasta este intenția.
12. **Mediu - configurare office hard-coded.** Kiosk folosește coordonate fixe București și rază 50m; nu există configurare per sediu.
13. **Mediu - schema din `ATTENDANCE_SYSTEM.md` este parțial depășită.** Documentul descrie un `hrTimesheets.entries` pe date, dar codul curent folosește `days.{day}`; nu trebuie folosit ca sursă operațională fără actualizare.
14. **Mediu - noțiunea de „8 ore” este hard-coded în banca de ore/KPI**, chiar dacă programul salariatului poate avea altă durată.
15. **Scăzut/mediu - lipsă confirmare suplimentară la ștergere timesheet.** Dialogul este forma principală și butonul execută direct operația; nu există al doilea pas explicit.

## 10. Întrebări și necunoscute

- Care este ruleset-ul Firestore/Storage efectiv deployat în proiectul live?
- Care este build SHA al Vercel și corespunde workspace-ului analizat?
- Dispecerul trebuie să poată modifica salariați, condică, sărbători și sincronizări sau numai să le vadă?
- Care este definiția aprobată business/juridică pentru C1-C7, banca de ore, tichete de masă și norma zilnică?
- Pauza standard se scade întotdeauna când intersectează prezența, chiar dacă angajatul nu a luat-o?
- DEL/WE/SL trebuie să accepte intrări Pontaj la sync sau trebuie protejate ca CO/CFP/CM/IN?
- Ce se întâmplă legitim pentru ture peste miezul nopții? Codul curent limitează sesiunea la ziua Start.
- Cine și prin ce flux corectează o sesiune brută `attendance` greșită? Condica manuală nu modifică sursa brută.
- Este acceptată verificarea parolei salariatului pe dispozitiv kiosk și politica de captură/stocare selfie?
- Există mai multe sedii/geofence-uri sau numai coordonata hard-coded?
- Funcția `autoStopAttendanceSessions` și triggerul `onAttendanceCheckoutSync` cu modificările locale sunt deployate în live?
- Există indexurile Firestore necesare pentru dashboard și overtime în toate mediile?

## 11. Funcționalități care nu au putut fi verificate fără scrieri

- Start/Stop complet prin kiosk sau FieldCheckInCard;
- verificarea parolei unui salariat și capturarea/încărcarea selfie;
- GPS/reverse geocode și clasificarea efectivă office/field pe dispozitiv real;
- regula de 60 secunde în live;
- blocarea reală pentru concediu și suprapunere;
- sincronizarea manuală pe zi/interval și exactitatea documentului rezultat;
- re-sincronizarea „ieri”;
- CRUD salariat/departament/sărbători/condică/cereri;
- ștergeri și confirmări destructive până la final;
- exporturile CSV/DOCX și conținutul fișierelor;
- cron-urile 23:59/program+grace și triggerul Firestore în runtime;
- trimiterea notificărilor HR;
- comportamentul live cu rol `dispecer` separat;
- ruleset-ul Firebase deployat și permisiunile reale la nivel backend;
- stările de eroare produse de rețea/index/rules și recuperarea după ele.

## 12. Concluzie operațională

Sursa brută de adevăr pentru o pontare este `attendance/{sessionId}`; condica este o proiecție materializată în `hrTimesheets/{employeeId}_{month}`. Identitatea stabilă care leagă fluxul este `hrEmployees.userUid -> users/{uid}`, iar `employeeId` capturat în sesiune reduce dependența de lookup-uri ulterioare. Orice audit de corectitudine trebuie să compare ambele niveluri, deoarece dashboardul de pontaj și condica nu citesc aceeași colecție și pot diverge prin sync, coduri HR protejate, editări manuale sau erori de asociere.

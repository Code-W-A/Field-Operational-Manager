# Etapa 3 - Blocaje, decizii și testabilitate Pontaj

## 1. Regula de interpretare

Documentele Etapei 2 sunt canonice în ordinea temporală `00` -> `01 reguli` -> `01 vectori`. Inventarul conține observații anterioare remedierilor; secțiunea „Actualizare după remediere” și vectorii actualizați au prioritate pentru branch-ul curent. Niciun test nu va transforma o intenție necunoscută într-un oracol blocking.

Etichete:

- `ASSUMPTION`: premisă explicită, verificată la setup.
- `BUSINESS_BLOCKED`: trebuie decisă politica HR.
- `DEPLOYMENT_BLOCKED`: trebuie demonstrată versiunea/configurația deployată.
- `TESTABILITY_BLOCKED`: lipsește controlul determinist necesar.
- `MANUAL_DEVICE_REQUIRED`: browser automation nu dovedește hardware/OS real.

## 2. Registrul contradicțiilor și caracterizărilor

| ID | Temă | Branch curent | Ramură legacy/deployment | Teste | Defect/decizie |
|---|---|---|---|---|---|
| `CTR-01` | manual + Pontaj | client și Functions păstrează ambele, union | deployment vechi putea elimina Pontaj și salva 0 | `CAL-V40`, `CAL-V41`, `CHR-001`, `CHR-002` | `DEPLOYMENT_BLOCKED` până la SHA staging; nu mai este contradicție locală |
| `CTR-02` | WORK fără hours/entries | 0 pe condică/profil/raport | build vechi: 8 vs 0 | `CAL-V35`, `CHR-003` | caracterizare legacy numai dacă deployment SHA este vechi |
| `CTR-03` | cross-midnight | clamp în ziua START | sesiune legacy neclampuită: bulk după start, single după end | `CAL-V64`, `CAL-V65`, `CAL-V70`, `CHR-004..006` | oracol final pentru sesiuni legacy rămâne `BUSINESS_BLOCKED` |
| `CTR-04` | timezone browser | unele limite client depind de runtime; Functions Bucharest | browser UTC/London/NY poate selecta altă zi | `CAL-V71`, `TIM-006..009`, `CHR-007` | trebuie unificată politica calendaristică pentru assert final |
| `CTR-05` | DST | entry nou are timestampuri absolute și 60m | entry legacy numai HH:mm poate da 2h/0h până la resync | `CAL-V66`, `CAL-V67`, `CHR-008..010` | criteriu: resync adaugă timestamps și 60m; deploy vechi este characterization |
| `CTR-06` | calcul cereri | helper client face union/intersecție | Functions request path face sumă brută/pauză brută | `CHR-011..013`, `REQ-013` | defect separat; alegerea formulei este `BUSINESS_BLOCKED` |
| `CTR-07` | grilă vs KPI | branch curent folosește helper comun | celule/deployment vechi pot citi `cell.hours` direct | `CAL-V07`, `CAL-V35`, `CON-012`, `CHR-014` | blocking numai după SHA staging și resync legacy |
| `CTR-08` | C6/C7 duplicate | prezența face union, C6/C7 sumă brută | același document produce 4h vs 8h în V80 | `CAL-V80`, `CHR-015` | `BUSINESS_BLOCKED`: C6/C7 brut sau union |
| `CTR-09` | auto checkout lucrări | kill-switch false | client/Functions au seturi de status/zi diferite dacă se activează | `CAL-V61`, `CHR-016` | nu activa test blocking până la decizie și fanion |
| `CTR-10` | metadata request | client/Functions pot materializa metadata diferit | sourceRequest poate dispărea la resync DEL | `CAL-V46`, `CHR-017` | defect de audit, oracol characterization |
| `CTR-11` | schema lock cron | clientul scrie `activeSessionId`; Functions compara `sessionId` | cronul inchide sesiunea, dar lock-ul client ramane stale | `SYN-006`, `CAL-V62/63` | `DEF-LOCK-001`; characterization pana la remediere |

Pentru fiecare `CHR-*`: PASS înseamnă că ramura caracterizată corespunde SHA-ului declarat; diferența față de branch-ul curent creează defect, nu retry. Testele de acceptare viitoare rămân `test.fixme` conceptual, nu vor fi implementate active înaintea deciziei.

`CHR-001..017` sunt aliasuri de characterization ale cazurilor `CAL/SYN/CON/REQ` mapate, nu 17 cazuri suplimentare în totalul de 232.

## 3. Necunoscute business

| ID | Întrebare | Impact | Criteriu necesar |
|---|---|---|---|
| `BUS-01` | Dispecerul poate edita/sincroniza/șterge HR sau doar citi? | AUTHORIZATION P0/P1 | matrice semnată per acțiune |
| `BUS-02` | Cum se rezolvă doi salariați omonimi la fallback? | asociere greșită | refuz ambiguitate sau regulă deterministică explicită |
| `BUS-03` | DEL/WE/SL rămân compatibile cu Pontaj? | cod/ore | tabel cod -> protejat/merge |
| `BUS-04` | Definiția juridică C1-C7 și duplicatele? | rapoarte/overtime | formule aprobate |
| `BUS-05` | `zileLucrate` include CO/CFP/CM/IN/DEL/WE/SL? | KPI/export | definiție nominală și numerică |
| `BUS-06` | Pauza intersectată se scade chiar dacă nu a fost luată? | ore efective | politică pauză |
| `BUS-07` | Tura legitimă peste miezul nopții se taie, împarte sau păstrează? | V65 | regulă de atribuire zi/lună |
| `BUS-08` | Sâmbăta/duminica au normă așteptată zero în banca de ore? | bancă | calendar de normă |
| `BUS-09` | Kiosk trebuie să ceară parola salariatului? | securitate/UX | starea viitoare a flagului și politica credentialelor |
| `BUS-10` | Selfie este audit sau identificare biometrică? | legal/Storage | scop, retenție, consimțământ, acces |
| `BUS-11` | Există un singur sediu/geofence? | office/field | configurație per locație și rază |
| `BUS-12` | Cine corectează attendance brut după editarea condicii? | audit/proiecție | workflow de reconciliere |

Testele de caracterizare pot rula; criteriile business viitoare sunt `BLK-001..004` și nu blochează deploy-ul până la decizie.

## 4. Necunoscute deployment

- `DEP-01`: Vercel build SHA versus workspace.
- `DEP-02`: SHA Firebase Functions pentru `autoStopAttendanceSessions`, `onAttendanceCheckoutSync`, schedule grace.
- `DEP-03`: ruleset Firestore efectiv; repository-ul conține reguli permissive.
- `DEP-04`: ruleset Storage efectiv și fallback-ul general OR.
- `DEP-05`: indexuri Firestore în emulator/staging/live.
- `DEP-06`: variabilele kill-switch și timezone runtime Functions.
- `DEP-07`: Auth claims/role document și timpul de propagare după schimbarea rolului.
- `DEP-08`: configurația office reală versus coordonata hard-coded.

Global setup staging trebuie să oprească testele mutante dacă `DEP-01/02` nu sunt capturate sau nu corespund commitului așteptat.

## 5. Necesită `data-testid` sau hook de test

Nu se modifică aplicația în această etapă. Atributele de mai jos sunt propuneri pentru etapa de implementare.

| ID | Componentă/element | Atribut recomandat | Motiv | Teste blocate/degradate |
|---|---|---|---|---|
| `HOOK-01` | `TimesheetGrid` celulă | `data-testid="timesheet-cell-{employeeId}-{day}"` | MUST; grid dens, text/cod duplicat | `CAL-*`, `CON-009..015` |
| `HOOK-02` | coloane sumar condică | `data-testid="summary-{metric}-{employeeId}"` | C1-C7 fără nume accesibil unic | `CAL-V73..V85`, `REP-*` |
| `HOOK-03` | KPI condică/dashboard | `data-testid="kpi-{name}"` | carduri cu texte similare și valori dinamice | proiecții P0 |
| `HOOK-04` | rând attendance | `data-session-id` | numele/utilizatorul nu este unic | dashboard și concurență |
| `HOOK-05` | interval zi | `data-entry-index` + `data-session-id` | icon buttons duplicate | edit/delete/selfie |
| `HOOK-06` | selector salariat kiosk | `data-user-uid` | omonime | kiosk/fallback |
| `HOOK-07` | stare kiosk | `data-testid="kiosk-state"` | aceleași texte apar în dialog/toast | flow state machine |
| `HOOK-08` | Start/Stop field/kiosk | `data-testid="attendance-start|stop"` | mai multe butoane Start/Stop în pagină | dublu click/concurență |
| `HOOK-09` | dialog zi | `data-employee-id`, `data-day` | titlul localizat nu este ID stabil | condică |
| `HOOK-10` | calendar day | `data-date="YYYY-MM-DD"` | textul zilei se repetă | timezone/perioade |
| `HOOK-11` | upload selfie/profile/CM | `data-testid` per input/status | input ascuns și preview duplicat | Storage/errors |
| `HOOK-12` | status sync | `data-testid="sync-status"` | status aproximativ și text dinamic | `SYN-012` |
| `HOOK-13` | view/compact controls | `aria-pressed` + testid | butoane icon/text schimbător | responsive/localStorage |
| `HOOK-14` | raport rând/chart | `data-employee-id`, metric | SVG/chart nu este semantic | report comparisons |
| `HOOK-15` | indicator active | `data-testid="active-{employeeId}-{day}"` | punct numai vizual | onSnapshot |
| `HOOK-16` | test clock | Playwright Clock client + `nowMs` injectat in core Functions | MUST_BEFORE_TIME_TESTS; `serverTimestamp` ramane bounded | `TIM-*`, `STA/STO`, cron |
| `HOOK-17` | invoke Functions | propunerea de endpoint cu secret este UNSAFE; se apeleaza direct handlerul intern in Functions emulator | nu trebuie sa existe endpoint de productie | `CAL-V62/63`, `SYN-006` |
| `HOOK-18` | fault injection | proxy generic UNSAFE; HTTP prin route, Rules/emulator sau adapter integration | niciun proxy activabil in productie | `RES-*` |
| `HOOK-19` | barieră tranzacție | UNSAFE in bundle; E2E verifica invariantul final, adapter numai integration | winner nominal nu se aserteaza | START/STOP/sync simultaneous |
| `HOOK-20` | seed guard | `NEXT_PUBLIC_DISABLE_HR_SEED=true` cu precedenta fata de development | MUST_BEFORE_TESTS | route/empty/live safety |

Fără `HOOK-01..15`, testele pot folosi `getByRole/getByLabel/getByTitle/getByText`, dar riscul de flakiness rămâne explicit. Fără `HOOK-16..20`, cazurile respective sunt `TESTABILITY_BLOCKED`, nu se rezolvă cu `waitForTimeout`.

## 6. Selectori existenți recomandați

- Rute/header: URL + heading/card title stabil.
- Formulare: `getByLabel` unde `id/Label` există; selecturile Radix prin role `combobox` și numele labelului.
- Dialoguri: `getByRole('dialog', {name: /Adaugă condică|Șterge pontajul|Sărbători legale|Verificări pontaj/})`.
- Comenzi: `getByRole('button',{name:'Sincronizează'})`, `Start`, `Stop`, `Salvează`, `Anulează`.
- Icon buttons existente: `aria-label` pentru Editează salariat/Șterge interval/Șterge pauză; `title` pentru selfie/edit/delete.
- Selectori fragili interziși: clase Tailwind, `nth-child`, textul numeric singur, coordonate de click, structura internă Radix, selector după culoare.

Elementele fără label unic sunt acoperite de `HOOK-*`; testul nu trebuie să ghicească după layout.

## 7. Necesită dispozitiv real

| ID | Funcționalitate | Ce simulează Playwright | Ce rămâne manual |
|---|---|---|---|
| `DEV-01` | cameră kiosk/field | fake media, granted/denied, imagine sintetică | prompt OS, cameră fizică, rotație |
| `DEV-02` | GPS/geofence | geolocation exactă și permission | acuratețe, indoor drift, GPS off |
| `DEV-03` | touchscreen kiosk | context touch, tap rapid, viewport | palm rejection, scanner hardware |
| `DEV-04` | portrait/landscape | viewport resize | rotație OS și reluare stream |
| `DEV-05` | offline/reconnect mobil | context offline | radio real, captive portal |
| `DEV-06` | selfie legal/biometric | upload/access tehnic | consimțământ și orice identificare biometrică reală |

## 8. Imposibil de automatizat determinist în forma curentă

1. Cronul real la 23:59 fără `HOOK-16/17`.
2. Ordinea exactă a două tranzacții fără `HOOK-19`; se poate testa invariantul final, nu winner-ul nominal.
3. `serverTimestamp` la milisecundă exactă; se verifică intervalul și monotonia.
4. Email livrat extern; se verifică request/outbox mock, nu inboxul real.
5. Reverse geocode real stabil; se mock-uiește răspunsul.
6. Permission prompts și hardware camera/GPS reale; `MANUAL_DEVICE_REQUIRED`.
7. Rules live fără autorizare explicită pentru probe directe; numai staging/emulator.
8. Statusul „Verifică Status” ca egalitate de conținut; implementarea este aproximativă, deci testul verifică exact caracterizarea lui.

## 9. Cazuri blocate înainte de blocking

| ID | Criteriu viitor | Blocaj |
|---|---|---|
| `BLK-001` | fallback omonime refuză sau alege regula aprobată | `BUS-02` |
| `BLK-002` | tura cross-midnight are o singură regulă de zi/lună | `BUS-07` |
| `BLK-003` | calculul cererilor este identic client/Functions | `CTR-06` |
| `BLK-004` | C6/C7 duplicate folosesc formula aprobată | `CTR-08` |
| `BLK-005` | permisiunile dispecerului sunt aprobate și rules le impun | `BUS-01`, `DEP-03` |
| `BLK-006` | selfie retention/access/biometric policy este aprobată | `BUS-10`, `DEP-04` |

## 10. Defecte ce trebuie urmărite separat

- `DEF-SEC-001`: rules Firestore repository permit read/write global.
- `DEF-SEC-002`: fallback Storage autentificat poate anula restricția selfie.
- `DEF-SYNC-001`: calcul request client versus Functions.
- `DEF-TZ-001`: limite browser versus Bucharest pentru unele căi.
- `DEF-UX-001`: dashboard/rapoarte pot afișa gol/zero la eroare doar cu console.error.
- `DEF-SYNC-002`: statusul sync nu demonstrează egalitate.
- `DEF-HR-001`: `createdAt` salariat este rescris la editare.
- `DEF-SEED-001`: pagini aparent read-only pot apela seed pe baza goală.
- `DEF-LOCK-001`: Functions cron verifica `lock.sessionId`, dar clientul scrie `lock.activeSessionId`; lock-ul ramane stale dupa auto-stop.

Fiecare defect primește link la testul de caracterizare și nu este mascat prin retry.

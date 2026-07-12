# Etapa 3 - Matrice de trasabilitate Playwright Pontaj

Abrevieri: `E` emulator, `S` staging, `L` live read-only, `M` manual device, `B` blocked; `UI` acțiune integrală prin UI, `SD` seed direct, `FN` Functions, `CLK` clock fix, `2C` două contexte. Toate testele referă profilurile din `02-plan-playwright-complet.md` și fixtures din `02-fixtures-si-medii.md`.

## 1. Rută -> teste

| Rută/flux | Autorizat/read/loading/empty/error/refresh/query | Neautorizat/direct/rol schimbat | Mutații/proiecții |
|---|---|---|---|
| `/dashboard/resurse-umane/pontaj` | RT-001, CON-001/004 | RT-011, RT-020 | alias către toate CON/CAL |
| `/dashboard/resurse-umane/pontaj/dashboard` | RT-002, RES-001/004 | RT-012, RT-020 | CAL-V01..V17, REP-002 |
| `/dashboard/resurse-umane/pontaj/sync` | RT-003, SYN-012/014 | RT-013, RT-020 | SYN-003/004, CAL-V38..V47 |
| `/dashboard/resurse-umane/condica-prezenta` | RT-004, CON-001..010 | RT-014, RT-020 | CON-011..022, CAL-V01..V85 |
| `/dashboard/resurse-umane/salariati` | RT-005, HR-001/008 | RT-015, RT-020 | HR-002..006/009/010 |
| `/dashboard/resurse-umane/salariati/[id]` | RT-006, HR-007, REP-002 | RT-016, RT-020 | HR-004/014..016 |
| `/dashboard/resurse-umane/departamente` | RT-007, HR-011/012 | RT-017, HR-013 | HR-005/011/012 |
| `/dashboard/resurse-umane/rapoarte` | RT-008, REP-001..009 | RT-018, RT-020 | exports read-only |
| `/dashboard/kiosk` | RT-009 | RT-019 | redirect only |
| `/kiosk` | RT-010, KSK-001..004/014 | RT-019/020 | KSK-005..013 |
| `/dashboard/lucrari`/Field card | STA-001..020, STO-001..018 | RT-020 | attendance/lock/sync |
| primul QR | SYN-007, CAL-V59/60 | auth din RT-020 | attendance auto |
| raport semnat | CAL-V61, CHR-016 | deployment blocked | kill-switch false |
| Functions/cron | SYN-002/006, STO-014/017, CAL-V62/63 | RES-007 | attendance/timesheet; lock stale characterization DEF-LOCK-001 |

Fiecare rută are cazuri pentru date valide/parțiale/inconsistente prin fixture-urile DAY/ATT, iar back/forward este parte din PF-ROUTE.

## 2. Rol -> teste

| Rol | UI/access | Acțiuni | Firebase direct |
|---|---|---|---|
| admin | RT-001..009, RT-017 | HR/CON/SYN/REP, STA dacă EMP-ADMIN | RES-005..007 |
| dispecer | RT-011..018 data rows, HR-013 | condică/salariați/sync/rapoarte/sărbători/editări; departamente restricționat | RES-005, BLK-005; intenție `BUS-01` |
| tehnician | RT-011..019 | STA/STO/QR/Field | RES-005 read/write HR negative/characterization |
| kiosk | RT-009/010/019 | KSK-001..014 | RES-005/006 |
| client | RT-011..019 | niciun flux HR | RES-005..007 negative |
| rol necunoscut/fără rol | RT-011..020 | none | RES-005..007 negative |
| neautentificat | RT-011..020 | none | RES-005..007 negative |

Toate rolurile verifică UI, URL final, lipsa flash-ului, direct URL, refresh, token expirat și role change. Redirectul nu este folosit ca dovadă pentru rules.

## 3. Componentă -> teste

| Componentă | Teste |
|---|---|
| `ProtectedRoute` | RT-011..020, RES-002/005 |
| `FieldCheckInCard` | STA-001..020, STO-001..018 |
| `KioskCheckIn` | KSK-001..013 |
| `SelfieCapture` | STA-013/014, STO-010, KSK-005/006/010, RES-003 |
| `TimesheetGrid` | CON-002/003/005..013, CAL-V01..V85 |
| `TimesheetListView` | CON-002/005..009, REP-002 |
| `DayEntryPopover` | CON-009..013/020/021 |
| `AddDayEntryDialog` | CON-014..017/021 |
| `DeleteTimesheetDialog` | CON-013/018/021 |
| `LegalHolidaysDialog` | CON-019/021, STA-012 |
| `LeaveRequestsSection` | HR-014..016, REP-006 |
| `CreateLeaveRequestDialog`/HR request | HR-014..016, CHR-011..013 |
| `EmployeeEditDialog` | HR-002..006, HR-003/021 contract |
| `EmployeesTable/DataTable` | HR-001 |
| `HrTimesheetReport/Charts` | REP-001..003/008 |
| `OvertimeReport` | REP-004..009 |
| attendance storage/lock | STA/STO/CAL-V48..V63/RES |
| sync client/Functions | SYN-001..014, CAL-V38..V47/62..67 |

## 4. Dialog -> teste

Toate includ PF-DIALOG (open/X/Cancel/Escape/outside/focus trap/Tab/Shift+Tab/Enter/double submit/disabled/loading/error/success/reopen/reset/refresh/responsive/a11y).

| Dialog | Teste |
|---|---|
| Adaugă/Editează salariat | HR-002..006, CON-021 |
| Zoom poză profil | HR-006, CON-021 |
| Aplicăm programul la toți | HR-008..010, CON-021 |
| Departament nou/Editează | HR-011, CON-021 |
| Confirmare ștergere departament | HR-012, CON-021 |
| Adaugă condică | CON-014..017/021 |
| Șterge pontajul | CON-013/018/021 |
| Sărbători legale | CON-019/021 |
| Detaliu zi | CON-009/021 |
| Editare interval | CON-011/021 |
| Selfie Start/Stop | STA-013/014, STO-010, KSK-005/006, CON-021 |
| Verificări pontaj | CON-010/021 |
| Curăță intervale | CON-010/021 |
| Editare cerere aprobată | CON-020/021 |
| Cerere HR nouă | HR-014..016, CON-021 |
| Pontaj deja pornit | KSK-007, CON-021 |
| Nu există tură activă | KSK-007, CON-021 |
| Confirmare Start/Stop | KSK-005/006/012, CON-021 |
| Confirmare zi specială | STA-012, KSK-008, CON-021 |
| Parolă/deconectare kiosk | KSK-009/013, CON-021 |
| Selfie viewer Start/Stop | CON-009, CON-021 |

## 5. Colecție/Storage -> teste

| Sursă | Read | Write/delete/security/proiecție |
|---|---|---|
| `users/{uid}` | RT, KSK-001..004, HR-004 | RT-020, RES-005/007 |
| `hrEmployees` | toate rutele HR/KSK/dashboard | HR-002..010, STA-003 backfill, RES-005 |
| `hrDepartments` | RT-007, HR-005/011 | HR-011..013, RES-005 |
| `hrSettings/defaults` | STA-008, CAL-V22/23/26/27 | HR-008..010; snapshot/restore |
| `attendance` | RT-002, dashboard, PF-STOP/SYNC | STA/STO/SYN/CAL-V01..V71, RES-005 |
| `attendanceActiveSessions` | field/kiosk readers | STA/STO/CAL-V48..V63; cron incearca delete, dar mismatch-ul `activeSessionId`/`sessionId` lasa lock stale; RES-005 |
| `hrTimesheets` | condică/profil/report | SYN/CON/REQ/CAL-V01..V85, RES-005 |
| `hrRequests` | profile/condică/overtime | HR-014..016, CON-020, CHR-011..013, RES-005 |
| `hrCounters` | request setup | HR-015 concurență/restore, RES-005 |
| `hrHolidays` | STA-012/CON/summary | CON-019, CAL-V79, RES-005 |
| `logs` | audit inspect | PF-START/PF-STOP, STO-018, RES-005 |
| `lucrari` | QR/report gate | SYN-007, CAL-V59..61, CHR-016 |
| Storage selfie | CON-009 | STA/STO/KSK, RES-003/006 |
| Storage profil/CM | profile/request | HR-006/014/015, RES-003/006 |

## 6. Regulă -> teste

| Regulă | Teste |
|---|---|
| UID -> employeeId -> nume fallback | STA-001..006, SYN-010, CAL-V48..52 |
| lock unic și retry | STA-017..019, STO-007..009, CAL-V53..58 |
| minimum Stop 60 sec | STO-002..004, CAL-V56/57 |
| concediu/protected codes | STA-010, SYN-009, HR-016, CAL-V28..34/47 |
| overlap Start `[start,end)` | STA-011 |
| program individual/default/fallback | STA-008/009, CAL-V21..27/85 |
| pauză manuală/default/intersecție | SYN-011, CAL-V08..17 |
| union intervale/duplicate | SYN-008/009/013, CAL-V04..07/39..45/80 |
| WORK fără hours = 0 | CAL-V35, CON-007, CHR-003 |
| dashboard KPI effective vs elapsed row | CAL-V01/05/06/73/74, REP-002 |
| DST timestamps absolute | CAL-V66/67, TIM companion, CHR-008..010 |
| clamp zi START | STO-016/017, CAL-V62..65/70 |
| cron inchide sesiunea, dar nu sterge lock-ul client curent din cauza mismatch-ului de camp | SYN-006, CAL-V62/63, DEF-LOCK-001 |
| QR numai fără active/pontaj azi | SYN-007, CAL-V59/60 |
| auto checkout kill-switch | CAL-V61, CHR-016 |
| C1-C7/tichete/bancă | CON-006, REP-006, CAL-V73..85 |
| request client vs Functions | CHR-011..013, BLK-003 |
| rules ≠ ProtectedRoute | RES-005..007 |

## 7. Vector V01-V85 -> teste

`Oracole` este compact în ordinea `attendance; timesheet; dashboard/condică/profil/raport`. Valorile complete rămân literal în documentul sursă; această matrice nu le înlocuiește.

| Vector/test | Nivel/mediu/seed | Acțiune Playwright | Oracole compacte | Tip/capabilități |
|---|---|---|---|---|
| V01 / CAL-V01 | P0 E, UI | Start08 Stop16:30 | completed; WORK8; elapsed8.5/effective8 | pozitiv, CLK |
| V02 / CAL-V02 | P0 E, SD+UI | proiectează 08-12 | completed; WORK4; toate4 | pozitiv |
| V03 / CAL-V03 | P0 E, SD+UI | 13-16:30 | completed; WORK3.5 | boundary |
| V04 / CAL-V04 | P0 E, SD+sync | 2 sesiuni separate | 2 completed; 2P/7.5; proiecții7.5 | multi |
| V05 / CAL-V05 | P0 E, SD+sync | overlap | 2 completed; 2P union7.5; elapsed9/KPI7.5 | overlap |
| V06 / CAL-V06 | P0 E, SD+sync | duplicate | 2 completed; 2P union7.5; elapsed16/KPI7.5 | duplicate |
| V07 / CAL-V07 | P1 E, SD+open | manual overlap | attendance absent; TS union7.5; condică7.5 | characterization |
| V08 / CAL-V08 | P0 E, SD+sync | break manual15m | completed; 8.25; elapsed8.5/effective8.25 | break |
| V09 / CAL-V09 | P0 E, SD+sync | partial break | completed; 4.5; elapsed4.75/KPI4.5 | boundary |
| V10 / CAL-V10 | P0 E, SD+sync | break outside | completed; 4 | negative overlap |
| V11 / CAL-V11 | P0 E, SD+sync | 2 breaks | completed; 7.75 | multi-break |
| V12 / CAL-V12 | P0 E, SD+sync | overlapping breaks | completed; break union,7 | overlap |
| V13 / CAL-V13 | P0 E, SD+sync | invalid manual break | completed; fallback,8 | fallback |
| V14 / CAL-V14 | P0 E, SD+sync | valid break outside | completed; default suppressed,8.5 | characterization |
| V15 / CAL-V15 | P0 E, SD+sync | 12:20-12:40 | completed;10m; KPI0.2h/read exact format | partial |
| V16 / CAL-V16 | P0 E, SD+sync | 12:40-13:10 | completed;10m | partial |
| V17 / CAL-V17 | P0 E, SD+sync | exact break | completed;0,ticket0 | boundary |
| V18 / CAL-V18 | P1 E, SD+open | manual 08-24 | no A; invalid/0 | negative |
| V19 / CAL-V19 | P1 E, SD+open | 22-02 | no A; invalid/0 | cross-midnight manual |
| V20 / CAL-V20 | P1 E, SD+open | adjacent | no A;7.5 | adjacency |
| V21 / CAL-V21 | P0 E, UI | Start09:17:59 | active delay17; după Stop sync | lateness, CLK |
| V22 / CAL-V22 | P0 E, UI | defaults07:30 Start07:45 | active delay15; net după Stop | fallback, CLK |
| V23 / CAL-V23 | P0 E, UI | no config Start08:12 | active snapshot08-16:30 delay12 | hard fallback |
| V24 / CAL-V24 | P0 E, UI | early Start07:30 Stop16:30 | completed;8.5; elapsed9 | early |
| V25 / CAL-V25 | P0 E, UI | Stop15 | completed;6.5; bank-1.5 | early leave characterization |
| V26 / CAL-V26 | P0 E, SD+sync | employee break13 | completed;8 | precedence |
| V27 / CAL-V27 | P0 E, SD+sync | partial employee break | completed;8.25 | per-field fallback |
| V28 / CAL-V28 | P0 E, SD+resync | CO + attendance | completed; CO unchanged; D elapsed/C code | protected |
| V29 / CAL-V29 | P0 E, SD+resync | CFP | completed; CFP unchanged | protected |
| V30 / CAL-V30 | P0 E, SD+resync | CM | completed; CM unchanged | protected |
| V31 / CAL-V31 | P0 E, SD+resync | IN10-12 | completed; IN; summary IN2 | protected |
| V32 / CAL-V32 | P0 E, SD+resync | DEL+P | completed; DEL hours8; work report0 | compatible code |
| V33 / CAL-V33 | P0 E, SD+resync | WE Sat | completed; WE4,C6=4 | weekend |
| V34 / CAL-V34 | P0 E, SD+resync | SL Sun | completed; SL4,C7=4 | special |
| V35 / CAL-V35 | P0 E, SD+open | WORK no fields | no A;0 pe toate | regression |
| V36 / CAL-V36 | P0 E, SD+open | WORK hours6 | no A;6,bank-2 | fallback stored |
| V37 / CAL-V37 | P1 E, UI | add manual08-10 | no A; WORK2; D0/C/R2 | manual |
| V38 / CAL-V38 | P0 E, SD+sync | P10-16 | completed;5.5; elapsed6 | sync |
| V39 / CAL-V39 | P0 E, SD+sync | M08-10+P10-16 | completed;M+P7.5; D6/C7.5 | mixed |
| V40 / CAL-V40 | P0 E, SD+client sync | M08-12+P10-16 | completed;both7.5 | client characterization |
| V41 / CAL-V41 | P0 E+S, SD+FN | aceeași, trigger | completed;both7.5 | Function parity, FN |
| V42 / CAL-V42 | P0 E, SD+resync2x | repeat | A unchanged; one regenerated P,7.5 | idempotency |
| V43 / CAL-V43 | P0 E, SD+resync | end edit15 | completed;P10-15,4.5 | regenerate |
| V44 / CAL-V44 | P0 E, SD+resync2x | overlap P | 2A; both P,union7.5 | idempotent overlap |
| V45 / CAL-V45 | P0 E, SD+sync | M+break+P | completed;6.75 | preserve |
| V46 / CAL-V46 | P1 E, SD+resync | DEL metadata+P | completed;DEL, metadata poate lipsi | deduced/audit |
| V47 / CAL-V47 | P0 E, SD+resync | CO metadata+P | completed;cell intact | protected metadata |
| V48 / CAL-V48 | P0 E, UI | Start08 | active+lock; no TS | state |
| V49 / CAL-V49 | P0 E, UI | Start no employee hint | active employee resolved; future TS E1 | identity |
| V50 / CAL-V50 | P0 E, UI | legacy name | active+backfill; TS E1 | legacy mutation |
| V51 / CAL-V51 | P0 E, UI | tech no employee | active no employee; Stop no TS | negative relation |
| V52 / CAL-V52 | P0 E, UI | admin/disp no employee | no session/lock | negative |
| V53 / CAL-V53 | P0 E, UI 2C | simultaneous Start | one active+lock; loser error | concurrency, 2C |
| V54 / CAL-V54 | P0 E, SD+UI | active no lock then Start | two active + lock newest | known defect |
| V55 / CAL-V55 | P0 E, SD+UI | orphan lock Start | new active, lock overwritten | stale lock |
| V56 / CAL-V56 | P0 E, UI | Stop+30s | remains active+lock; no TS | negative, CLK |
| V57 / CAL-V57 | P0 E, UI | Stop+60s | completed, lock absent,1m | boundary, CLK |
| V58 / CAL-V58 | P0 E, UI 2C | simultaneous Stop | one complete; loser error; one final state | concurrency |
| V59 / CAL-V59 | P1 E, UI QR | first QR09 | auto active field+lock | QR |
| V60 / CAL-V60 | P1 E, SD+UI QR | existing completed then QR | no new A/lock | negative |
| V61 / CAL-V61 | P1 E+S, UI | sign report | active unchanged | kill-switch, DEP |
| V62 / CAL-V62 | P0 E+S, SD+FN | EOD active08 | completed16:30, TS8; lock `activeSessionId` ramane stale | cron characterization, FN/CLK, DEF-LOCK-001 |
| V63 / CAL-V63 | P0 E+S, SD+FN | EOD active20 | completed EOD, ~4h absolute; lock ramane stale | cron boundary characterization, DEF-LOCK-001 |
| V64 / CAL-V64 | P0 E, UI CLK | Stop after midnight | clamp Jul31 EOD; Jul TS59m display/absolute meta | EOM |
| V65 / CAL-V65 | P0 E, SD+sync | legacy cross-day | branch start/end differs | contradictory, BLK-002 |
| V66 / CAL-V66 | P0 E, SD+sync CLK | spring instants | A1h; timestamps; D/C/R1h | DST |
| V67 / CAL-V67 | P0 E, SD+sync CLK | autumn instants | A1h; timestamps; D/C/R1h | DST |
| V68 / CAL-V68 | P1 E, SD+open CLK | Feb28 | doc2026-02 day28 | calendar |
| V69 / CAL-V69 | P1 E, SD+open CLK | Feb29 2028 | doc/day29 | leap |
| V70 / CAL-V70 | P0 E, UI CLK | Dec31->Jan | clamp/doc2026-12 | EOY |
| V71 / CAL-V71 | P0 E, SD+sync BR-UTC | instant boundary | browser/Function day branch | contradictory TZ |
| V72 / CAL-V72 | P1 E, UI request | overtime7.5 | TS cap23:59=449m | boundary |
| V73 / CAL-V73 | P0 E, SD+open | P07:30-17 | presence9,C1/C2=.5,C3=1 | reporting |
| V74 / CAL-V74 | P0 E, SD+open | P04-21 | presence16.5,C1=4,C2=4.5,C3=2,C4=2,C5=4.5 | tiers |
| V75 / CAL-V75 | P1 E, SD+open | route client | travel/C1=1,presence8 | route |
| V76 / CAL-V76 | P1 E, SD+open | route home | travel/C2=.75,presence8 | route |
| V77 / CAL-V77 | P1 E, SD+open | Sat P08-12 | presence4,C6=4,ticket0 | weekend |
| V78 / CAL-V78 | P1 E, SD+open | Sun | presence4,C7=4,ticket0 | weekend |
| V79 / CAL-V79 | P1 E, SD+open | holiday Mon | presence4,C7=4,ticket0 | holiday |
| V80 / CAL-V80 | P0 E, SD+open | duplicate P Sat | presence union4,C6 raw8 | contradictory, BLK-004 |
| V81 / CAL-V81 | P0 E, SD+open | WORK8 + approved CO | presence8,CO1,ticket0 | request exclusion |
| V82 / CAL-V82 | P0 E, SD+open | 7 special codes | zileLucrate7,SL8,report counts | business characterization |
| V83 / CAL-V83 | P0 E, SD+open | 2 active, one TS8 | total8,avg4 | denominator |
| V84 / CAL-V84 | P0 E, SD+open | WORK8+6 | presence14,bank-2,tickets2 | monthly |
| V85 / CAL-V85 | P0 E, SD+open | net schedule6,work6 | bank/diff0 | individual norm |

Toți cei 85 de vectori sunt asociați explicit; niciunul nu este implicit. `UI` absent înseamnă că fixture-ul numeric necesită seed direct, dar proiecția se verifică în UI. `M` este companion numai pentru media/GPS, nu cerință a oracolului numeric.

## 8. Risc inventar -> teste

| Risc 00 | Teste / rezultat |
|---|---|
| 1 Firestore rules deschise | RES-005, DEF-SEC-001; P0 |
| 2 Storage fallback larg | RES-006, DEF-SEC-002; P0 |
| 3 ProtectedRoute client-side | RT-011..020 + RES-005..007 |
| 4 două implementări sync | SYN-002/009/013, CAL-V40/41 |
| 5 merge sync diferit | characterization CTR-01; branch curent parity |
| 6 seed la open | CON-004, HR-001, REP-008 + HOOK-20 |
| 7 fallback nume backfill | STA-003/004, CAL-V50 |
| 8 createdAt rescris | HR-002, DEF-HR-001 |
| 9 erori UI doar console | CON-004, REP-008, RES-001, DEF-UX-001 |
| 10 status sync aproximativ | SYN-012, DEF-SYNC-002 |
| 11 dispecer acțiuni HR | RT-017, HR-013, BLK-005 |
| 12 office hard-coded | STA-015, KSK-010, BUS-11 |
| 13 documentație schema veche | toate assertă `days.{day}`; review guard |
| 14 normă 8h hard-coded | CAL-V85 confirmă remedierea curentă; staging deployment check |
| 15 ștergere fără confirmare secundară | CON-018 characterization + UX defect dacă business cere două faze |

## 9. Contradicție -> characterization

| Contradicție | Client | Functions/legacy | Race/defect/acceptare |
|---|---|---|---|
| manual + Pontaj | CHR-001/CAL-V40 | CHR-002/CAL-V41 | SYN-013; CTR-01 deployment |
| WORK fără hours | CHR-003/CAL-V35 current0 | deployment legacy 8/0 | DEF/CTR-02 |
| cross-midnight | CHR-004 clamp | CHR-005 start selector, CHR-006 end selector | CAL-V65, BLK-002 |
| browser timezone | CHR-007 + TIM projects | Functions Bucharest | CAL-V71, DEF-TZ-001 |
| DST | CHR-008 new spring, CHR-009 new autumn | CHR-010 legacy/resync | CAL-V66/67 |
| request calc | CHR-011 client, CHR-012 Functions | CHR-013 last-write | DEF-SYNC-001, BLK-003 |
| grid/KPI | CHR-014 current helper/legacy | deployment SHA | CAL-V07/35 |
| C6/C7 raw vs union | CHR-015 | same document two metrics | CAL-V80, BLK-004 |
| auto checkout statuses | CHR-016 | disabled/current branches | CAL-V61 |
| metadata request | CHR-017 | client/Functions/resync | CAL-V46 |

## 10. Funcționalitate neverificată -> test planificat

| Neverificat în Etapa 1/2 | Teste planificate |
|---|---|
| Start/Stop kiosk/field | STA, STO, KSK, CAL-V48..58 |
| parolă/selfie/cameră | KSK-009/010, STA-013/014, STO-010, DEV-01/06 |
| GPS/geofence/reverse | STA-015/016, KSK-010, DEV-02 |
| 60 secunde | STO-002..004, CAL-V56/57 |
| concediu/overlap Start | STA-010/011, HR-016 |
| sync zi/interval/ieri | SYN-003..005 |
| CRUD employee/dept/holiday/timesheet/request | HR-002..016, CON-012..020 |
| ștergeri destructive | CON-013/018, HR-012/014 |
| CSV/DOCX | CON-022, HR-015, REP-007 |
| cron/trigger runtime | SYN-002/006, STO-014/017, CAL-V62/63 |
| notificări HR | HR-015, RES-003 |
| dispecer live | RT/HR-013, DEP/BUS blocked |
| rules deployate | RES-005..007 staging companion |
| errors/recovery/index | RES-001..004, SYN-014 |

## 11. Verificare P0/P1

Niciun ID P0/P1 nu se închide doar pe UI. PF-START, PF-STOP, PF-SYNC, PF-CONDICA, PF-HR și PF-REPORT cer documente before/after, proiecții, refresh/context nou, aserțiuni negative și cleanup. LIVE_READ_ONLY nu găzduiește niciun pas mutant.

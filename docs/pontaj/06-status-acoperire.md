# Status acoperire pontaj - ETAPA 7

> Actualizare finala 2026-07-17: registru istoric. Reconcilierea autoritativa este `final-audit-232.md`: 232 ID-uri unice, 200 PASS local, 25 caracterizate, 2 security deferred, 1 manual pending, 4 business blocked si 0 FAIL. Cerinta staging separat este `SUPERSEDED_BY_OWNER_DECISION`.

Generat inaintea implementarii ETAPA 7 si actualizat dupa executia finala. Registrul separa cele 232 de cazuri logice: 141 non-vector, 85 vectori CAL si 6 decizii blocate. Un test data-driven nu transforma automat toate ID-urile in cazuri implementate.

Statusurile din acest document sunt actualizate dupa executia finala. La momentul inventarului initial, `PARTIAL` inseamna ca exista doar o dovada componenta (vector, unit sau un singur rol/branch), nu contractul integral al ID-ului.

| ID | Status | Fisier test | Test | Nivel | Blocking | Motiv |
|---|---|---|---|---|---|---|
| RT-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-001 alias pontaj cu query | PLAYWRIGHT UI/INTEGRATION | da | Redirectul final si query-ul sunt verificate fara mutatii HR/attendance. |
| RT-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-002 admin direct si refresh | PLAYWRIGHT UI | da | Accesul admin ramane stabil dupa refresh. |
| RT-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-003 admin direct si refresh | PLAYWRIGHT UI | da | Ruta dashboard pontaj este accesibila adminului. |
| RT-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-004 admin direct si refresh | PLAYWRIGHT UI | da | Ruta sync este accesibila adminului. |
| RT-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-005 admin direct si refresh | PLAYWRIGHT UI | da | Condica este accesibila adminului. |
| RT-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-006 fisa salariatului cu luna | PLAYWRIGHT UI | da | Query, refresh si back/forward sunt verificate. |
| RT-007 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-007 admin direct si refresh | PLAYWRIGHT UI | da | Departamentele sunt accesibile adminului. |
| RT-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-008 admin direct si refresh | PLAYWRIGHT UI | da | Rapoartele sunt accesibile adminului. |
| RT-009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-009 alias dashboard kiosk | PLAYWRIGHT UI | da | Aliasul ajunge la ruta kiosk permisa. |
| RT-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-010 kiosk fara flash dashboard | PLAYWRIGHT UI | da | Continutul dedicat apare fara flash protejat. |
| RT-011 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-011 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Redirect final, lipsa continut HR si zero scrieri relevante. |
| RT-012 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-012 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Rolul nepermis nu obtine continut HR. |
| RT-013 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-013 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Rolul nepermis nu obtine continut HR. |
| RT-014 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-014 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Tehnicianul este redirectionat si nu produce scrieri HR/attendance. |
| RT-015 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-015 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Rolul necunoscut este refuzat fail-closed. |
| RT-016 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-016 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Utilizatorul fara rol este refuzat fail-closed. |
| RT-017 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-017 dispecer si restrictii | PLAYWRIGHT UI | da | Accesul dispecerului si redirecturile celorlalte roluri sunt verificate. |
| RT-018 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-018 rol interzis | PLAYWRIGHT UI/INTEGRATION | da | Lipsa documentului users duce la logout, fara loader infinit. |
| RT-019 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-019 kiosk refuza non-kiosk | PLAYWRIGHT UI | da | Rolurile non-kiosk si neautentificatul sunt refuzate. |
| RT-020 | IMPLEMENTED_PASSING | tests/e2e/pontaj/routes/access.spec.ts | RT-020 schimbare rol | PLAYWRIGHT UI | da | Refreshul si contextul nou elimina accesul dupa schimbarea rolului. |
| STA-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-001 employeeId direct | PLAYWRIGHT UI/INTEGRATION | da | O singura sesiune activa si lock corect. |
| STA-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-002 rezolvare userUid | PLAYWRIGHT UI/INTEGRATION | da | employeeId este rezolvat si persistat. |
| STA-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-003 fallback fullName | PLAYWRIGHT UI/INTEGRATION | da | Fallbackul legacy si backfill-ul userUid sunt verificate. |
| STA-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-004 fullName ambiguu | PLAYWRIGHT UI/INTEGRATION | da | Ambiguitatea este refuzata cu zero scrieri; Start reuseste dupa asocierea explicita userUid. |
| STA-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-005 tehnician fara employee | PLAYWRIGHT UI/INTEGRATION | da | Caracterizarea curenta salveaza attendance fara employeeId si nu creeaza timesheet. |
| STA-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-006 admin/dispecer fara employee | PLAYWRIGHT UI/INTEGRATION | da | Actiunea este blocata inainte de write. |
| STA-007 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/start/core-start.spec.ts | STA-007 date employee incomplete | CHARACTERIZATION UI | nu | Comportamentul curent pentru inactiv/fara email/fara departament este fixat, fara regula business confirmata. |
| STA-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-008 precedenta program | PLAYWRIGHT UI/INTEGRATION | da | Individual, defaults, partial si fallback sunt verificate. |
| STA-009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-009 devreme/intarziere | ORACLE/INTEGRATION | da | Pragul si floor-ul lateStartMinutes sunt verificate. |
| STA-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-010 coduri HR | PLAYWRIGHT UI/INTEGRATION | da | CO/CFP/CM/IN blocheaza, DEL permite. |
| STA-011 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-011 overlap semi-deschis | ORACLE/INTEGRATION | da | Limitele [start,end) sunt verificate. |
| STA-012 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-012 weekend confirmare | PLAYWRIGHT UI/INTEGRATION | da | Anularea nu scrie, confirmarea scrie snapshotul. |
| STA-013 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-013 selfie optional | PLAYWRIGHT UI/STORAGE | da | Start fara selfie salveaza starea lipsa. |
| STA-014 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-014 camera indisponibila | PLAYWRIGHT UI | da | Fallbackul fara selfie ramane functional. |
| STA-015 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-015 prag GPS | ORACLE | da | Distantele 49/50/51 m sunt determinate exact. |
| STA-016 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-016 GPS refuzat | PLAYWRIGHT UI/INTEGRATION | da | Refuzul opreste Start si nu lasa documente orphan. |
| STA-017 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-017 Start concurent | PLAYWRIGHT UI/INTEGRATION | da | Doua contexte converg la o singura sesiune activa. |
| STA-018 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-018 lock stale/orphan | PLAYWRIGHT UI/INTEGRATION | da | Lock-ul stale sau orphan este inlocuit. |
| STA-019 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-019 active fara lock | PLAYWRIGHT UI/INTEGRATION | da | Sesiunea este recuperata fara duplicare. |
| STA-020 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-020 offline | PLAYWRIGHT UI/INTEGRATION | da | Offline inainte de commit produce zero write; refreshul recupereaza. |
| STO-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-001 Stop normal | PLAYWRIGHT UI/INTEGRATION | da | Aceeasi sesiune este completata, lock-ul sters si timesheetul sincronizat. |
| STO-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/stop-minimum.spec.ts | STO-002 CAL-V56 +30 secunde | PLAYWRIGHT UI/INTEGRATION | da | Stop este refuzat, sesiunea si lock-ul raman active. |
| STO-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/stop-minimum.spec.ts | STO-003 CAL-V57 +60 secunde | PLAYWRIGHT UI/INTEGRATION | da | Limita exacta este acceptata si sincronizata. |
| STO-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-004 +61 secunde | PLAYWRIGHT UI/INTEGRATION | da | Timestampul exact este pastrat. |
| STO-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-005 fara sesiune/completed | PLAYWRIGHT UI/INTEGRATION | da | Stop nu este oferit si datele nu sunt mutate. |
| STO-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-006 refresh/relogin | PLAYWRIGHT UI/INTEGRATION | da | Sesiunea activa este recuperata. |
| STO-007 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-007 fara lock | PLAYWRIGHT UI/INTEGRATION | da | Sesiunea se completeaza fara a inventa lock. |
| STO-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-008 lock spre alta sesiune | PLAYWRIGHT UI/INTEGRATION | da | Lock-ul strain este protejat. |
| STO-009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-009 Stop concurent | PLAYWRIGHT UI/INTEGRATION | da | Exista o singura tranzitie si zero duplicate. |
| STO-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-010 checkout fara selfie | PLAYWRIGHT UI/STORAGE | da | Statusul lipsa este salvat fara obiect Storage. |
| STO-011 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-011 field-field | PLAYWRIGHT UI/INTEGRATION | da | Mode, checkOutMode si location sunt pastrate. |
| STO-012 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-012 sync client | PLAYWRIGHT UI/INTEGRATION | da | Se materializeaza o singura intrare corelata. |
| STO-013 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-013 failure dupa commit | INTEGRATION EMULATOR | da | Adapterul test-only produce determinist sync failure dupa commit; attendance ramane completed. |
| STO-014 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-014 trigger Functions | FUNCTIONS INTEGRATION | da | Triggerul real din emulator sincronizeaza completed. |
| STO-015 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-015 commit inainte de confirmare | INTEGRATION/ORACLE | da | Callbackul de confirmare observa commitul si lock-ul sters inainte de confirmarea UI. |
| STO-016 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-016 cross-midnight | PLAYWRIGHT UI/INTEGRATION | da | Sesiunea ramane in documentul zilei Start. |
| STO-017 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-017 clamp | ORACLE/INTEGRATION | da | Clamp-ul foloseste programEnd al zilei Start. |
| STO-018 | IMPLEMENTED_PASSING | tests/e2e/pontaj/stop/core-stop.spec.ts | STO-018 log failure post-commit | INTEGRATION EMULATOR | da | Audit failure este izolat; attendance si timesheet raman persistate. |
| KSK-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-001 roster eligibil | PLAYWRIGHT UI | da | Tehnician, admin si dispecer asociati apar in roster. |
| KSK-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-002 deduplicare/omonim | PLAYWRIGHT UI/INTEGRATION | da | UID unic, sortare stabila si selectare explicita. |
| KSK-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-003 excluderi | PLAYWRIGHT UI | da | Inactiv, incomplet si rol neeligibil sunt exclusi. |
| KSK-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts; lib/attendance/kiosk-roster-loader.test.ts | KSK-004 loading/empty/error retry | UI + UNIT | da | UI timeout/error/retry, loading si empty; loaderul acopera determinist hrEmployees si fiecare query users. |
| KSK-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-005 Start | PLAYWRIGHT UI/INTEGRATION/STORAGE | da | Attendance, lock, selfie, log, refresh. |
| KSK-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-006 Stop | PLAYWRIGHT UI/INTEGRATION/STORAGE | da | Completed, lock sters, timesheet, selfie, log. |
| KSK-007 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-007 dialoguri | PLAYWRIGHT UI/INTEGRATION | da | Anularea nu scrie date nepermise. |
| KSK-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-008 zile speciale | PLAYWRIGHT UI/INTEGRATION | da | Sambata, duminica si sarbatoare: Cancel no-op, Confirm snapshot si refresh. |
| KSK-009 | IMPLEMENTED_PASSING_WITH_BUSINESS_GAP | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-009 flag parola | CHARACTERIZATION | da | Flagul este false; politica parolei individuale nu este definita. |
| KSK-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-010 camera/GPS/offline | PLAYWRIGHT UI/INTEGRATION | da | Camera fake/denied/absent, GPS denied/timeout, Storage failure si retry/reconnect fara duplicate. |
| KSK-011 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-011 utilizatori separati | PLAYWRIGHT UI/INTEGRATION/STORAGE | da | Documente si selfie paths distincte. |
| KSK-012 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-012 concurenta | PLAYWRIGHT UI/INTEGRATION | da | Start/Stop concurent converge. |
| KSK-013 | IMPLEMENTED_PASSING | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-013 logout parola | PLAYWRIGHT UI | da | Gresita/corecta, Escape, X, Cancel, dublu-submit si curatare context. |
| KSK-014 | IMPLEMENTED_PASSING_WITH_MANUAL_HARDWARE_GAP | tests/e2e/pontaj/kiosk/kiosk.spec.ts | KSK-014 responsive companion | PLAYWRIGHT + MANUAL | da | Companion portrait/landscape; camera/GPS/touch/rotatie fizice raman manuale. |
| SYN-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-001 Stop catre client | INTEGRATION | da | Intrarea este corelata prin attendanceSessionId. |
| SYN-002 | DEPLOYMENT_BLOCKED | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-002 trigger Functions real | FUNCTIONS INTEGRATION | da | PASS blocking in emulator; companion staging nu a fost executat. |
| SYN-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-003 sync zilnic UI | PLAYWRIGHT UI/INTEGRATION | da | Ziua si updatedAt sunt materializate. |
| SYN-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-004 sync interval | PLAYWRIGHT UI/INTEGRATION | da | Sunt scrise exact zilele selectate. |
| SYN-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-005 re-sync ieri | PLAYWRIGHT UI/INTEGRATION | da | Re-sincronizarea este idempotenta. |
| SYN-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-006 cron EOD | FUNCTIONS/PUBSUB INTEGRATION | da | Cronul completeaza, sincronizeaza si elimina lock-ul stale. |
| SYN-007 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-007 QR Stop sync | PLAYWRIGHT UI/INTEGRATION | da | Metadata auto este pastrata la sincronizare. |
| SYN-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-008 multiple/duplicate/overlap | PLAYWRIGHT UI/ORACLE | da | Union-ul nu dubleaza intrarile de sesiune. |
| SYN-009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-009 manual si Pontaj | PLAYWRIGHT UI/ORACLE | da | Manualul si codurile protejate sunt pastrate. |
| SYN-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-010 employee resolution | PLAYWRIGHT UI/INTEGRATION | da | Direct, UID, nume si missing au tintele caracterizate. |
| SYN-011 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-011 pauza si idempotenta | PLAYWRIGHT UI/ORACLE | da | Pauza default si doua sync-uri raman deterministe. |
| SYN-012 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-012 status aproximativ | CHARACTERIZATION UI | nu | UI considera ziua existenta sincronizata fara corelare; comportament documentat, nu oracle strict. |
| SYN-013 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-013 sync concurent | PLAYWRIGHT UI/INTEGRATION | da | Doua sincronizari converg fara duplicate. |
| SYN-014 | IMPLEMENTED_PASSING | tests/e2e/pontaj/sync/core-sync.spec.ts | SYN-014 interval invalid/timezone | PLAYWRIGHT UI/ORACLE | da | Intervalul invalid este disabled si timezone-ul browserului nu muta instantul. |
| CON-001 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/read.spec.ts | CON-001 luna/calendar | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-002 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/read.spec.ts | CON-002 grid/list | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-003 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/read.spec.ts | CON-003 mod compact | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-004 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/read.spec.ts | CON-004 empty fara scrieri | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-005 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/summary.spec.ts | CON-005 KPI | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-006 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/summary.spec.ts | CON-006 tichete/traseu/C1-C7 | PLAYWRIGHT UI | da | PASS; DEF-001 are regresie. |
| CON-007 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/summary.spec.ts | CON-007 coduri/partial | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-008 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/realtime.spec.ts | CON-008 two-tab | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-009 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/day-dialog.spec.ts | CON-009 detaliu zi | PLAYWRIGHT UI + Firestore | da | PASS; DEF-006 are regresie. |
| CON-010 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/day-dialog.spec.ts | CON-010 curatare | PLAYWRIGHT UI + Firestore | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-011 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-011 editare interval | PLAYWRIGHT UI + Firestore | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-012 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-012 adaugare multi-zi | PLAYWRIGHT UI + Firestore | da | PASS; DEF-002 are regresie. |
| CON-013 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-013 stergere selectiva | PLAYWRIGHT UI + Firestore | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| CON-014 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-014 validare luna | PLAYWRIGHT UI + Firestore | da | PASS; DEF-003 are regresie. |
| CON-015 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-015 overlap/adiacent | PLAYWRIGHT UI + Firestore | da | PASS; DEF-005 are regresie. |
| CON-016 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/write.spec.ts | CON-016 cross-month | PLAYWRIGHT UI + Firestore | da | PASS; DEF-003 are regresie. |
| CON-017 | IMPLEMENTED_PASSING; TESTABILITY_BLOCKED_NON_BLOCKING UI | tests/e2e/pontaj/condica/atomicity.spec.ts | CON-017 atomic boundary | INTEGRATION TEST-ONLY + production boundary | da | Contractul atomic PASS; fault UI real necesita hook de productie interzis. |
| CON-018 | IMPLEMENTED_PASSING | tests/e2e/pontaj/condica/atomicity.spec.ts, convergence.spec.ts | CON-018 operatie N/two-tab | PLAYWRIGHT UI + INTEGRATION TEST-ONLY | da | PASS: eroare pre-commit, retry, campuri necerute si doua taburi. |
| CON-019 | IMPLEMENTED_PASSING | tests/e2e/pontaj/condica/holidays.spec.ts, convergence.spec.ts | CON-019 singleton/mutex/two-tab | PLAYWRIGHT UI + Firestore | da | PASS: snapshot/restaurare exacta, metadata, sortare si propagare. |
| CON-020 | IMPLEMENTED_PASSING | tests/e2e/pontaj/condica/approved-request.spec.ts, convergence.spec.ts | CON-020 fault/retry/two-tab | PLAYWRIGHT UI + CHARACTERIZATION | da | PASS: conflict UI, retry, clear si convergenta; resync partial este caracterizat. |
| CON-021 | IMPLEMENTED_PASSING | tests/e2e/pontaj/condica/dialog-a11y.spec.ts | CON-021 a11y/responsive | PLAYWRIGHT UI | da | PASS: role/nume, focus, Escape, backdrop, viewport si bounding boxes. |
| CON-022 | IMPLEMENTED_NON_BLOCKING | tests/e2e/pontaj/condica/export.spec.ts | CON-022 CSV | PLAYWRIGHT UI | da | PASS 2026-07-13 in executia unificata Condica 35/35. |
| HR-001 | NOT_STARTED | - | HR-001 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-002 | NOT_STARTED | - | HR-002 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-003 | NOT_STARTED | - | HR-003 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-004 | NOT_STARTED | - | HR-004 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-005 | NOT_STARTED | - | HR-005 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-006 | NOT_STARTED | - | HR-006 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-007 | NOT_STARTED | - | HR-007 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-008 | NOT_STARTED | - | HR-008 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-009 | NOT_STARTED | - | HR-009 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-010 | NOT_STARTED | - | HR-010 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-011 | NOT_STARTED | - | HR-011 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-012 | NOT_STARTED | - | HR-012 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-013 | NOT_STARTED | - | HR-013 - acoperire initiala | - | da | Nu exista inca un test dedicat care sa execute integral cazul logic. |
| HR-014 | IMPLEMENTED_PASSING | tests/e2e/pontaj/requests/lifecycle.spec.ts, approval.spec.ts | creare, aprobare si respingere | PLAYWRIGHT/EMULATOR | da | CO/CFP/CM/DEL/IN, metadata si zero timesheet la respingere: PASS. |
| HR-015 | IMPLEMENTED_PASSING | tests/e2e/pontaj/requests/concurrency.spec.ts | seriale si decizie concurenta | PLAYWRIGHT/EMULATOR | da | Seriale 1,2 monotone si tranzitie terminala protejata: PASS. |
| HR-016 | IMPLEMENTED_PASSING | tests/e2e/pontaj/condica/approved-request.spec.ts | overlap, editare si Clear CO | PLAYWRIGHT/EMULATOR | da | Resync, eliminare zile vechi si retry: PASS. |
| REP-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/hr-kpi.spec.ts | REP-001 KPI si grafic | PLAYWRIGHT UI/INTEGRATION | da | KPI si grafic folosesc minute efective; inclus in Reports 14/14. |
| REP-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/projection-consistency.spec.ts | REP-002 proiectii V01 | PLAYWRIGHT UI/INTEGRATION | da | Dashboard, condica, profil si raport sunt reconciliate pe seed izolat. |
| REP-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/employee-variants.spec.ts | REP-003 variante angajat | PLAYWRIGHT UI/INTEGRATION | da | Filtrele si proiectiile angajatului sunt verificate. |
| REP-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/overtime-filters.spec.ts | REP-004 filtre overtime | PLAYWRIGHT UI/INTEGRATION | da | Anul/luna si filtrele nu produc scrieri. |
| REP-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/reconciliation.spec.ts | REP-005 reconciliere | PLAYWRIGHT UI/INTEGRATION | da | Sumarul si reconcilierea sunt determinate pe emulator. |
| REP-006 | IMPLEMENTED_CHARACTERIZATION | tests/e2e/pontaj/reports/summary-c1-c7.spec.ts | REP-006 C1-C7 | PLAYWRIGHT UI/ORACLE | da | C6/C7 brut si prezenta union sunt caracterizari declarate. |
| REP-007 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/overtime-export.spec.ts | REP-007 export CSV | PLAYWRIGHT UI | da | Exportul este read-only si escape-ul CSV este verificat. |
| REP-008 | CHARACTERIZATION_DEF_UX_NON_BLOCKING | tests/e2e/pontaj/reports/states.spec.ts | REP-008 stari UI | PLAYWRIGHT UI | da | Error/retry pentru anumite abonari ramane caracterizare UX. |
| REP-009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/reports/year-timezone.spec.ts | REP-009 an/fus orar | PLAYWRIGHT UI/ORACLE | da | Patru fuse confirma limitarea la anul selectat. |
| RES-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/resilience/firestore-offline.spec.ts | RES-001 | PLAYWRIGHT EMULATOR | nu | Inclus in selectia RES unificata, 28 PASS. |
| RES-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/resilience/auth-boundary.spec.ts | RES-002 | PLAYWRIGHT EMULATOR | nu | Inclus in selectia RES unificata, 28 PASS. |
| RES-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/resilience/external-failures.spec.ts | RES-003 | PLAYWRIGHT EMULATOR | nu | Commit dupa 503 si cleanup Storage verificate local. |
| RES-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/resilience/snapshot-recovery.spec.ts | RES-004 | PLAYWRIGHT EMULATOR | nu | Recovery listener verificat in selectie RES unificata. |
| RES-005 | SECURITY_BUG_REMEDIATED | tests/e2e/pontaj/security/firestore-rules.spec.ts | RES-005 | FIREBASE WEB SDK | nu | Rules verzi dupa corectiile pentru backfill/stale lock; deny implicit activ. |
| RES-006 | SECURITY_BUG_REMEDIATED | tests/e2e/pontaj/security/storage-rules.spec.ts | RES-006 | FIREBASE WEB STORAGE SDK | nu | Owner, MIME, dimensiune si deny-by-default verificate. |
| RES-007 | STAGING_BLOCKED_NOT_EXECUTED | docs/pontaj/10b-rezultate-res007-staging.md | RES-007 | STAGING | nu | Staging FOM, conturile E2E si izolarea SMTP nu pot fi demonstrate; zero probe mutante executate. |
| RES-008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/a11y/responsive-pages.spec.ts | RES-008 | PLAYWRIGHT UI | nu | Responsive/a11y inclus in selectia RES unificata, 28 PASS. |
| CAL-V01 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V01 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V02 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V02 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V03 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V03 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V04 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V04 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V05 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V05 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V06 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V06 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V07 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V07 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V08 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V08 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V09 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V09 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V10 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V10 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V11 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V11 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V12 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V12 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V13 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V13 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V14 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V14 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V15 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V15 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V16 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V16 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V17 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V17 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V18 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V18 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V19 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V19 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V20 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V20 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V21 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V21 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V22 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V22 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V23 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V23 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V24 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V24 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V25 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V25 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V26 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V26 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V27 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V27 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V28 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V28 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V29 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V29 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V30 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V30 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V31 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V31 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V32 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V32 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V33 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V33 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V34 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V34 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V35 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V35 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V36 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V36 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V37 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V37 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V38 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V38 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V39 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V39 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V40 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V40 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V41 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V41 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V42 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V42 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V43 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V43 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V44 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V44 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V45 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V45 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V46 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V46 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V47 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V47 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V48 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V48 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V49 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V49 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V50 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V50 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V51 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V51 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V52 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V52 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V53 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V53 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V54 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V54 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V55 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V55 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V56 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V56 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V57 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V57 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V58 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V58 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V59 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V59 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V60 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V60 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V61 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V61 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V62 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V62 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V63 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V63 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V64 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V64 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V65 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V65 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V66 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V66 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V67 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V67 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V68 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V68 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V69 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V69 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V70 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V70 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V71 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V71 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V72 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V72 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V73 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V73 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V74 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V74 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V75 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V75 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V76 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V76 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V77 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V77 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V78 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V78 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V79 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V79 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V80 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V80 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V81 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V81 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V82 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V82 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V83 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V83 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V84 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V84 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| CAL-V85 | IMPLEMENTED_PASSING | tests/e2e/pontaj/calculations/*.spec.ts | CAL-V85 | ORACLE + PLAYWRIGHT projection subset | nu | Vector executat si raportat PASS in ETAPA 6. |
| BLK-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/start/core-start.spec.ts | STA-004 | PLAYWRIGHT UI/INTEGRATION | da | Decizia pentru omonime a fost furnizata si implementata in ETAPA 7B. |
| BLK-002 | DEPLOYMENT_BLOCKED | docs/pontaj/02-blocaje-si-decizii.md | SYN-002 staging | DEPLOYMENT | da | Staging Functions validat lipsa; emulatorul este PASS. |
| BLK-003 | BUSINESS_BLOCKED | docs/pontaj/02-blocaje-si-decizii.md | BLK-003 | CHARACTERIZATION | da | Contractul de status sync aproximativ necesita decizie. |
| BLK-004 | BUSINESS_BLOCKED | docs/pontaj/02-blocaje-si-decizii.md | BLK-004 | CHARACTERIZATION | da | Atomicitatea sincronizarii pe interval necesita decizie. |
| BLK-005 | BUSINESS_BLOCKED | docs/pontaj/02-blocaje-si-decizii.md | BLK-005 | CHARACTERIZATION | da | Accesul dispecerului la departamente este contradictoriu. |
| BLK-006 | BUSINESS_BLOCKED | docs/pontaj/02-blocaje-si-decizii.md | BLK-006 | CHARACTERIZATION | da | Politica viitoare de parola kiosk nu este definita. |
| HR-001 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/list.spec.ts | HR-001 | PLAYWRIGHT UI/INTEGRATION | nu | Lista, cautare, paginare si zero scrieri verificate pe emulator. |
| HR-002 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/crud.spec.ts | HR-002 | PLAYWRIGHT UI/INTEGRATION | nu | Creare si editare; `createdAt` la editare este characterization DEF-HR-001. |
| HR-003 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/crud.spec.ts | HR-003 | PLAYWRIGHT UI/INTEGRATION | nu | Nume lipsa si timp invalid fara scrieri; reguli de interval ramase characterization. |
| HR-004 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/crud.spec.ts | HR-004 | PLAYWRIGHT UI/INTEGRATION | nu | Asociere si dezasociere explicita userUid. |
| HR-006 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/profile-photo.spec.ts | HR-006 | PLAYWRIGHT UI/INTEGRATION | nu | Upload/sterge in Storage Emulator si Firestore. |
| HR-008/009 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/defaults.spec.ts | HR-008, HR-009 | PLAYWRIGHT UI/INTEGRATION | nu | Defaults normalizate si completare selectiva a lipsurilor. |
| HR-011/012 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/departments.spec.ts | HR-011, HR-012 | PLAYWRIGHT UI/INTEGRATION | nu | CRUD si delete protejat de asocierea salariatului. |
| HR-005 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/managers-minimal.spec.ts; tests/e2e/pontaj/salariati/managers.spec.ts | HR-005 manageri pe sectoare | PLAYWRIGHT UI/INTEGRATION | nu | Deselectarea elimina fizic cheia stale prin tranzactie Firestore; Admin SDK si refresh sunt verificate. |
| HR-007 | PARTIAL | tests/e2e/pontaj/salariati/profile.spec.ts | HR-007 fisa salariat | PLAYWRIGHT UI/INTEGRATION | nu | Cazurile tinta sunt PASS, dar matricea completa si regresia nu sunt executate. |
| HR-010 | IMPLEMENTED_PASSING | tests/e2e/pontaj/salariati/defaults-attendance.spec.ts | HR-010 defaults si attendance snapshot | PLAYWRIGHT UI/INTEGRATION | nu | Programul si pauza sunt snapshot la Start; sesiunea activa nu este recalculata cu defaults noi. |
| HR-013 | IMPLEMENTED_CHARACTERIZATION | tests/e2e/pontaj/salariati/dispatcher.spec.ts | HR-013 dispecer | PLAYWRIGHT UI/INTEGRATION | nu | UI permite lista/creare salariat si refuza departamentele; BUS-01 si regulile Firestore raman fara politica aprobata. |
| HR-014-HR-016 | NOT_IMPLEMENTED | docs/pontaj/09a1-fundatie-hr.md | HR | N/A | nu | In afara scope-ului ETAPA 9A.1. |
| RES-001/002/003/004/008 | IMPLEMENTED_PASSING | tests/e2e/pontaj/resilience; tests/e2e/pontaj/a11y | RES | Firebase Web SDK/Playwright UI | nu | Selectia RES unificata este verde: 28 PASS. |
| RES-005/006 | SECURITY_BUG_REMEDIATED | tests/e2e/pontaj/security | RES | Firebase Web SDK/Storage SDK | nu | Regulile restrictive sunt verzi local; deploymentul nu este parte din gate. |
| RES-007 | STAGING_BLOCKED_NOT_EXECUTED | docs/pontaj/10b-rezultate-res007-staging.md | RES | STAGING | nu | Pregatirea 10B.1A este completa local: auth ruta/callable, email fail-closed si guard PASS; executia staging asteapta provisioning. |

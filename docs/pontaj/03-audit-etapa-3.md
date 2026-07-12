# Etapa 4 - Audit final al planului Playwright Pontaj

Data auditului: 11 iulie 2026. Auditul a fost efectuat pe workspace-ul curent, fara scrieri in aplicatie, Firebase sau documentele Etapelor 0-2.

## 1. Verdict

`NOT_READY_FOR_IMPLEMENTATION`

Catalogul functional este amplu si trasabil, dar infrastructura declarata drept `EMULATOR` nu exista in forma necesara, cinci selectoare critice lipsesc, doua P0 nu au oracol business, doua P0 nu sunt testabile conform pasilor propusi si oracolul cronului este contrazis de schema lock-ului din cod.

Conditiile exacte pentru a incepe Etapa 5 sunt:

1. `GATE-01`, `GATE-02`, `GATE-04`, `GATE-05`, `GATE-10`, `GATE-12` si `GATE-14` trebuie sa treaca.
2. Aplicatia trebuie conectata explicit la Auth, Firestore, Functions si Storage Emulator; proiectul live trebuie respins fail-closed.
3. Trebuie implementate selectoarele critice HOOK-01, 02, 04, 05 si 14 si controlul seed HOOK-20.
4. Handler-ele Functions de cron trebuie sa primeasca un `nowMs` injectabil si sa poata fi invocate intern in emulator, fara endpoint activabil in productie.
5. Contractul lock trebuie unificat: clientul scrie `activeSessionId`, iar Functions citeste momentan `sessionId`.
6. `STA-004` si `HR-013` raman in afara suitei blocking pana la deciziile BUS-02 si BUS-01.
7. `STO-013` si `RES-002` trebuie reproiectate ca teste de integrare cu fault/control de commit determinist sau scoase din blocking.

## 2. Dovezi critice din cod

| Constatare | Dovada | Impact |
|---|---|---|
| aplicatia nu se conecteaza la emulator | `lib/firebase/config.ts` foloseste direct `getAuth/getFirestore/getStorage`; nu exista `connect*Emulator` | toate cele 209 cazuri cu mediu primar emulator sunt momentan nesigure |
| emulator incomplet | `firebase.json` declara numai Firestore `8080`, Functions `5001` si UI `4000`; Auth si Storage lipsesc | fixtures de rol, Rules si selfie nu pot rula conform planului |
| Playwright local este mock, nu Firebase emulator | `playwright.config.ts` seteaza `NEXT_PUBLIC_E2E_TEST_MODE=true`; `MockDataContext` auto-autentifica admin | suita existenta nu demonstreaza contractele Firebase reale |
| seed-ul scrie in development | `seedHrIfEmpty` este activ daca `NODE_ENV=development` sau `NEXT_PUBLIC_ENABLE_HR_SEED=true` | deschiderea condicii/salariatilor/raportului local poate polua emulatorul si invalida empty states |
| lock client | `lib/attendance/storage.ts` scrie/citeste `activeSessionId` | schema reala a lock-ului |
| lock cron | `firebase-functions/src/index.ts`, `completeAttendanceSessionAuto`, compara `lock.sessionId` | cronul nu sterge lock-ul creat de client |
| Functions nu are clock injectabil | cronurile folosesc `Date.now()` direct | HOOK-16/17 este obligatoriu pentru cron si DST Functions |
| reguli Firestore deschise | `firestore.rules`: `allow read, write: if true` | probele negative trebuie sa esueze si sa raporteze defect de securitate |
| fallback Storage larg | fallback autentificat non-CRM se combina OR cu regula selfie | un utilizator autentificat poate trece probe care ar trebui refuzate |
| dashboard corect separat | KPI foloseste `calcEffectiveMinutes`; randul foloseste `end-start` | oracolele elapsed/effective din V01/V05/V06 sunt actuale |
| sync client/Functions aliniat | ambele pastreaza non-Pontaj si calculeaza union prin helperi oglinditi | V40/V41 au 7.5h pe branch-ul local |
| request client/Functions divergent | clientul foloseste `calcEffectiveMinutes`; Functions `calcMinutes` insumeaza brut si scade pauza brut | CTR-06 ramane real |
| banca individuala | `calculateEmployeeOvertimeBank` foloseste `getExpectedWorkMinutes` | V85 = 0 pentru norma neta 6h |
| C6/C7 brut | `sumEntryMinutes` reduce direct entry-urile Pontaj | V80 ramane characterization 4h prezenta versus C6 8h |

## 3. Verificare mecanica

Scripturile temporare au extras definitiile din tabele, nu valorile din rezumat.

| Verificare | Rezultat |
|---|---:|
| non-vector `RT/STA/STO/KSK/SYN/CON/HR/REP/RES` | 141, toate secventele complete |
| `CAL-V01..CAL-V85` | 85, fara lipsuri sau duplicate |
| `BLK-001..BLK-006` | 6, fara lipsuri sau duplicate |
| total logic | 232 |
| ID-uri duplicate | 0 |
| referinte la ID-uri inexistente | 0 |
| vectori nemapati | 0 |
| riscuri 00 nemapate | 0 din 15 |
| colectii/Storage nemapate | 0 |

Definitiile de numarare sunt:

- **caz logic**: un ID din cele 232;
- **test parametrizat**: o implementare care poate materializa mai multe cazuri logice, fara a reduce numarul logic;
- **data row**: varianta interna a aceluiasi contract; se raporteaza separat numai daca are ID propriu;
- **companion staging/manual**: aceeasi regula executata suplimentar in alt mediu, fara ID nou;
- **characterization**: test non-blocking care fixeaza comportamentul existent sau defectul;
- **blocked**: criteriu viitor fara executie activa si fara oracol inventat.

### Eroare de prioritati

Rindurile efective au `129 P0 + 84 P1 + 16 P2 + 3 P3 = 232`. Rezumatul Etapei 3 declara eronat `125 P0 + 88 P1`. Matricea are 68 vectori P0, nu 64. Totalul logic ramane 232.

### Dialoguri

Etapa 1 enumera 20 etichete de dialog, iar matricea Etapei 3 declara 21, dar combina `Parola/deconectare kiosk` si separa stari dinamice din acelasi `<Dialog>`. Acoperirea functionala exista, insa numarul 21 nu este o metrica mecanica stabila. Contractul corect este lista de 22 stari/dialoguri din matrice, nu numarul de componente React.

## 4. Audit oracole post-remediere

| Tema | Verdict |
|---|---|
| dashboard KPI efectiv / rand elapsed | corect in plan si cod |
| manual + Pontaj | V40/V41 corecte si identice local; companion staging cere SHA |
| WORK fara hours/entries | 0 in helper, condica, profil si raport; niciun P0 activ nu asteapta 8 |
| DST nou | timestamps absolute si 60m in V66/V67; corect |
| cron EOD | **incorect in plan**: sesiunea se inchide, triggerul poate sincroniza, dar lock-ul `activeSessionId` ramane din cauza citirii `sessionId` |
| norma individuala | V85 corect, 0h diferenta pentru program net 6h |
| overlap/duplicate | dovezile raman, calcul efectiv union; corect |
| C6/C7 | contradictia semantica ramane; V80 trebuie non-blocking characterization |
| cereri HR | contradictia ramane; CHR-011..013 si BLK-003 sunt corecte |

Oracole vechi/eronate ramase in Etapa 3 inaintea corectiei: lock `sessionId` in PF-START/fixtures, lock absent in SYN-006 si CAL-V62/63, plus totalurile P0/P1.

## 5. Clasificarea celor 129 P0

Clasificarea este exclusiva si indica blocajul dominant. Toate categoriile automate mostenesc gate-urile comune de infrastructura. `READY_AFTER_HOOK` inseamna ca, dupa infrastructura comuna, mai este necesar un hook/selector critic.

| Statut | Nr. | ID-uri |
|---|---:|---|
| READY | 0 | - |
| READY_AFTER_INFRASTRUCTURE | 82 | RT-011..020; STA-001/002/003/005/006/008/010/011/018; STO-001..005/007/008/012/016/017; KSK-005/006; SYN-001/003/007..011; HR-004/016; RES-005/006; CAL-V02/03/04/09..13/15..17/21..27/29..34/36/38/39/42..45/49..52/55/81..84 |
| READY_AFTER_HOOK | 33 | STA-017; STO-009/014; SYN-013; CON-005/006/007/012/013; REP-001/002; CAL-V01/05/06/08/14/28/35/40/41/47/48/53/56/57/58/64/66/67/70/73/74/85 |
| STAGING_ONLY | 1 | RES-007 |
| CHARACTERIZATION_ONLY | 8 | STA-019; SYN-006; CAL-V54/62/63/65/71/80 |
| BUSINESS_BLOCKED | 2 | STA-004; HR-013 |
| DEPLOYMENT_BLOCKED | 1 | SYN-002 |
| TESTABILITY_BLOCKED | 2 | STO-013; RES-002 |
| MANUAL_ONLY | 0 | - |

Nici cele 8 characterization, nici cele 2 business blocked, nici cele 2 testability blocked nu intra in blocking CI. `SYN-002` nu devine blocking pana la GATE-11. `CON-006`, `REP-001` si `REP-002` sunt cazuri mixte: data row V80 este non-blocking chiar daca restul cazului poate fi blocking.

## 6. P0 - contract comun auditat

Pentru fiecare P0 executabil, rolul si sursa sunt definite prin BASE/profil, fixture-ul numeric exista sau este derivat din vector, setup-ul este Admin SDK, cleanup-ul este manifest-driven, persistenta si asertiunile negative sunt cerute. Exceptiile demonstrate sunt:

- mecanismul Admin SDK existent nu este emulator-safe: initializeaza credential explicit din env;
- mecanismul de cleanup dupa proces intrerupt nu exista;
- staging identities sunt descrise simultan ca per-run si precreate;
- selectoarele pentru grid, summary, rand attendance, entry si raport nu sunt suficiente;
- `STO-013` nu poate injecta fault numai pe scrierea timesheet printr-un proxy Firestore generic;
- `RES-002` nu poate controla momentul exact al expirarii fata de commit;
- `STA-004` nu are expected result pentru omonime;
- `HR-013` depinde de matricea business a dispecerului;
- P0 bazate pe cron nu au invocare si clock Functions controlate;
- toate P0 emulator sunt serializate implicit de configuratia curenta, dar planul viitor trebuie sa declare singleton suites seriale si restul parallel-safe.

## 7. Selectori P0/P1

| Teste | Selector curent | Risc | Hook | Selector final |
|---|---|---|---|---|
| CAL/CON celula | buton cu `title="Nume - Ziua N"` si continut numeric duplicat | nume localizat/omonim, grid fara rand semantic | HOOK-01 | `timesheet-cell-{employeeId}-{day}` |
| CON/REP summary C1-C7 | `div` fara rol/atribut | aceeasi valoare apare repetat | HOOK-02 | `summary-{metric}-{employeeId}` |
| KPI | text CardTitle + parent locator | structura Card, dar text stabil | HOOK-03 optional | `kpi-{name}` |
| dashboard sesiune | `<TableRow>` fara ID expus | acelasi salariat poate avea mai multe sesiuni | HOOK-04 | `data-session-id` |
| interval zi | icon buttons cu `title`, fara entry identity | duplicate/overlap imposibil de ales sigur | HOOK-05 | `data-entry-index` si `data-session-id` |
| kiosk salariat | nume+rol accesibil | suficient pentru fixture unic; nu pentru omonime | HOOK-06 optional | `data-user-uid` |
| kiosk state | headings/dialog/toast | suficient | none | role + accessible name |
| Start/Stop | `Start`, `Stop`, `Ma pontez acum`, `Ma opresc acum` | unic in componenta/context | none | `getByRole(button,{name})` |
| dialog zi | titlu/data/nume | suficient pentru nume unic | HOOK-09 optional | metadata employee/day |
| calendar | DayPicker accessible date | stabil | none | role/gridcell accessible name |
| upload | label CM; controale selfie/profile accesibile partial | statusurile sunt ambigue | HOOK-11 optional | label inainte de testid |
| status sync | text si buton accesibil | contract aproximativ, dar selectabil | none | role/text |
| moduri Grid/Lista/Compact | butoane cu text schimbator | selectabile; lipseste `aria-pressed` | HOOK-13 optional | role + `aria-pressed` |
| raport/chart | SVG si randuri fara employee/metric | nu exista selector semantic unic | HOOK-14 | `data-employee-id`, `data-metric` |
| activ condica | title `In pontaj acum` + nume | suficient pe fixture unic | HOOK-15 optional | testid numai pentru densitate |

Selectori critici lipsa: **5** (`HOOK-01`, 02, 04, 05, 14).

## 8. Fixtures si cleanup

### Defecte de fixture

1. `LOCK-VALID` foloseste `sessionId`, dar codul client foloseste `activeSessionId`.
2. UID-urile staging sunt descrise per-run, desi aceeasi documentatie spune ca sunt precreate si nu se sterg.
3. `ownerRunId` nu ajunge in logurile create de codul real; cleanup-ul trebuie sa foloseasca manifestul si `metadata.sessionId`.
4. Singleton-urile necesita mutex global de suita, nu doar mentiunea `serial`.
5. `hrHolidays/2026` nu trebuie sa contina datele DST ca sarbatori decat in cazurile care cer explicit aceasta suprapunere.
6. cleanup-ul `finally` nu acopera SIGKILL/CI cancel; emulatorul se poate reseta, staging cere janitor cu manifest persistent.

### Specificatii de fixture lipsa

Sunt **9** contracte folosite generic, dar nedefinite ca fixture exact: `FAULT-FIRESTORE`, `FAULT-STORAGE`, `FAULT-AUTH`, `FAULT-LOG`, `FAULT-REVERSE`, setul `EMP-500+`, `DEP-FREE`, `REPORT-YEAR`, `REPORT-ROWS-EMPTY`. Acestea trebuie materializate in backlog inaintea testelor care le refera.

### Scopuri

- globale/suita: singleton snapshot, config emulator, identities staging precreate;
- per-worker: Auth users emulator, employee, department, namespace Storage;
- per-test: attendance, lock, timesheet day, request, work, logs;
- seriale: defaults, holidays, counter, omonime, fallback nume, batch >500.

## 9. Concurenta

| Caz | Operatii | Fara HOOK-19 | Invariant admis |
|---|---|---|---|
| STA-017/CAL-V53 | doua Start pentru acelasi UID | posibil, winner nominal nedeterminist | exact o sesiune active si un lock spre ea; loser eroare |
| STO-009/CAL-V58 | doua Stop pentru aceeasi sesiune | posibil, winner nominal nedeterminist | o tranzitie completed, lock absent, fara al doilea efect logic |
| SYN-013 | sync client si trigger / doua sync | posibil | cell final identic, fara entry duplicat |
| KSK-012 | doua tap-uri UI | posibil fara bariera commit | un flow/document final |
| HR-015 | doua incrementari counter | posibil prin tranzactie | doua seriale distincte |
| RES-002 | revocare auth exact in jurul commitului | nu este determinist | trebuie test adapter sau doua cazuri separate pre/post commit |

HOOK-19 nu trebuie introdus in codul de productie. Pentru testele Firestore se aserteaza invariantul final. Controlul retry-ului intern se testeaza la nivel integration cu adapter injectabil, nu prin endpoint.

## 10. Timp si timezone

- Ceasul existent din `lib/utils/test-clock.ts` controleaza doar codul client care foloseste `getAppNowMs`; nu controleaza toate apelurile `new Date()`, `serverTimestamp` sau Functions.
- Playwright Clock poate controla `Date` in browser si trebuie instalat inainte de navigare. `serverTimestamp` se aserteaza prin interval/monotonie, niciodata egalitate la milisecunda cu fake clock.
- Functions foloseste `Date.now()` direct in cron; necesita handler intern cu `nowMs` injectat.
- Triggerul Firestore poate fi capturat numai daca aplicatia si Functions folosesc acelasi project ID emulator.
- V66/V67 folosesc instante UTC si durata absoluta de 60m; HH:mm poate fi 02:30-04:30 sau 03:30-03:30.
- V64/V70 atribuie ziua/luna START pentru fluxul clamp actual; V65 si V71 raman characterization.
- Nici regula de 60s, nici cronul nu folosesc `waitForTimeout`.

## 11. Securitate

Separarea propusa UI / Firestore / Storage / Functions este corecta. Arrange si cleanup trebuie facute cu Admin SDK emulator, iar actiunea Rules cu Web SDK conectat la emulator si tokenul rolului. Rules locale permisive vor face probele negative sa esueze; acesta este rezultatul corect si deschide `DEF-SEC-001/002`, nu o problema de test.

`RES-007` trebuie impartit pe endpointuri reale. Cronurile si trigger-ele attendance nu au rol de utilizator si nu pot fi testate ca endpointuri pe rol. Endpointurile Next si callable existente se testeaza separat, pe staging izolat.

## 12. Medii si live safety

`seedHrIfEmpty` este apelat la deschiderea:

- condicii;
- listei salariatilor;
- fisei salariatului;
- raportului Pontaj HR.

In productie seed-ul este dezactivat implicit, dar poate fi reactivat prin `NEXT_PUBLIC_ENABLE_HR_SEED=true`. Testele live pentru RT-004/005/006/008, CON-001/002, HR-001 si REP-008 sunt permise numai daca build metadata demonstreaza seed disabled. Verificarea simpla ca HR nu este gol reduce riscul, dar nu este un guard fail-closed. Artefactele live trebuie redactate si nu includ document dumps, CNP, CI, selfie sau URL-uri Storage.

## 13. Redundanta si stratificare

Duplicarea START/STOP intre STA/STO, SYN si CAL este justificata la niveluri diferite numai daca nu fiecare vector executa intregul UI. Nivelurile recomandate sunt:

1. oracle pur pentru formule;
2. integration emulator pentru documente/triggers;
3. E2E UI reprezentativ pentru flux si proiectii;
4. contract staging pentru Auth/Functions/Storage/indexuri;
5. smoke live strict read-only;
6. manual device pentru hardware.

### Nivel minim CAL-V01..V85

| Vectori | Nivel minim | E2E UI complet |
|---|---|---|
| V01, V05, V06, V08, V14, V28, V35, V40, V47, V66, V67, V73, V74, V85 | oracle + integration | da, reprezentativ |
| V02-V04, V07, V09-V13, V15-V20, V26-V27, V29-V34, V36-V39, V42-V46, V81-V84 | oracle + integration + proiectie tintita | nu; seed + UI consumator |
| V21-V25, V48-V52, V55-V57, V64, V70 | integration + E2E state/UI | da |
| V53, V58 | integration concurenta + E2E invariant | da, fara winner nominal |
| V41 | integration Functions + contract staging | UI numai companion |
| V54 | integration characterization | nu blocking |
| V59-V61 | integration QR/automation | E2E reprezentativ V59; V61 deployment characterization |
| V62-V63 | integration Functions characterization | nu blocking pana la fix lock |
| V65, V71, V80 | oracle/integration characterization | nu blocking |
| V68-V69, V72, V75-V79 | oracle + proiectie tintita | nu complet |

Tabelul acopera explicit fiecare V01-V85, o singura data. Seturile sunt data-driven; un failure pastreaza ID-ul CAL individual.

## 14. Changelog corectii Etapa 3

Modificarile facute numai dupa incheierea auditului:

1. `02-plan-playwright-complet.md`: `activeSessionId`/`attendanceSessionId`, ruta sync completa, oracol cron characterization, infrastructura existenta marcata lipsa, live seed fail-closed, prioritati 129/84.
2. `02-matrice-trasabilitate.md`: schema lock si V62/V63 actualizate la stale lock characterization; regula cron corectata.
3. `02-fixtures-si-medii.md`: `LOCK-VALID.activeSessionId`, staging identities si cleanup dupa intrerupere clarificate.
4. `02-blocaje-si-decizii.md`: adaugat CTR/DEF pentru mismatch-ul lock, clasificarea hook-urilor corectata.

Nu au fost modificate documentele Etapelor 0-2 si nici codul aplicatiei.

## 15. Raport final

| Metrica | Rezultat |
|---|---:|
| cazuri logice inainte | 232 |
| cazuri logice dupa audit | 232 |
| P0 READY | 0 |
| P0 READY_AFTER_HOOK | 33 |
| P0 READY_AFTER_INFRASTRUCTURE | 82 |
| P0 STAGING_ONLY | 1 |
| P0 CHARACTERIZATION_ONLY | 8 |
| P0 BUSINESS_BLOCKED | 2 |
| P0 DEPLOYMENT_BLOCKED | 1 |
| P0 TESTABILITY_BLOCKED | 2 |
| P0 MANUAL_ONLY | 0 |
| hooks MUST | 7 |
| hooks optionale | 6 |
| gate-uri | 15 |
| fixtures lipsa | 9 |
| selectori critici lipsa | 5 |
| contradictii corectate in Etapa 3 | 5 |
| documente Etapa 3 modificate | 4 |
| documente Etapa 4 create | 4 |

Verdict final: `NOT_READY_FOR_IMPLEMENTATION`.

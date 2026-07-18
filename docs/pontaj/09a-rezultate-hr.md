# ETAPA 9A.1 - rezultate fundatie HR

Data executiei: 2026-07-13. Toate testele au folosit proiectul `demo-fom-pontaj-e2e` si Firebase Emulator Suite. Nu s-a accesat Firebase live.

## Executat pe Emulator

| Caz | Test | Rezultat |
| --- | --- | --- |
| HR-001 | `salariati/list.spec.ts` | PASS: listare, empty, cautare nume/email/departament, sortare, paginare, refresh si zero scrieri. |
| HR-002 | `salariati/crud.spec.ts` | PASS: creare, editare si persistenta documentului. |
| HR-003 | `salariati/crud.spec.ts` | PASS: nume lipsa si ora invalida, cu zero scrieri; start dupa end este CHARACTERIZATION, nu regula impusa. |
| HR-004 | `salariati/crud.spec.ts` | PASS: asociere/dezasociere explicita `userUid`. |
| HR-006 | `salariati/profile-photo.spec.ts` | PASS: upload si stergere sincronizeaza Firestore si Storage Emulator. |
| HR-008/009 | `salariati/defaults.spec.ts` | PASS: normalizare, singleton defaults si completarea numai a campurilor lipsa. |
| HR-011/012 | `salariati/departments.spec.ts` | PASS: CRUD de baza, manager, confirmare delete si refuz pentru departament asociat. |
| HR-007 | `salariati/profile.spec.ts` | PASS tintit: incarcare initiala, URL direct, luna februarie bisecta, refresh, Condica si Raport; lipsa salariatului nu produce seed/scriere. |
| HR-010 | `salariati/defaults-attendance.spec.ts` | PASS tintit: Start salveaza snapshotul program/pauza, modificarea defaults nu rescrie sesiunea activa, Stop calculeaza dupa snapshot, Start nou foloseste defaults noi. |
| HR-013 | `salariati/dispatcher.spec.ts` | CHARACTERIZATION PASS: dispecerul poate lista si crea salariat prin UI/Web SDK; URL-ul departamentelor este refuzat de UI. Politica BUS-01 ramane nedefinita. |

Executii confirmate dupa corectii:

- CRUD + departamente: 6 PASS.
- Fotografie profil: 2 PASS (inclusiv setup Auth).
- Program implicit: 1 PASS in rularea familiei anterioare.

## Corectii aplicate

- `DataTable` expune cautare globala si selector de dimensiune de pagina accesibil; lista de salariati indexeaza explicit nume, email si departamente.
- Lista salariatilor arata eroare persistenta si permite retry la esecul snapshotului.
- Dialogul salariatului afiseaza erori de validare persistente, accesibile (`role=alert`), inclusiv la blur pentru ore invalide.
- Fisa salariatului are loading/error/retry explicit si nu mai afiseaza fals starea de salariat inexistent inainte de primul snapshot.
- Attendance salveaza snapshotul de pauza la Start; sincronizarea client si triggerul Functions folosesc acel snapshot inainte de defaults curente. Acest lucru mentine 8h pentru 08:00-16:30 cu pauza 12:30-13:00 chiar daca defaults sunt ulterior schimbate la pauza de 15 minute.
- Persistenta salariatului normalizeaza `sectorIds` si elimina din `managerUidBySector` cheile din afara listei de sectoare.

## HR-005 inchis in 9A.1B

Defectul era in persistenta Firestore, nu in state-ul React: `setDoc(..., { merge: true })` pastra cheile nested ale `managerUidBySector` care lipseau din payload. Corectia elimina explicit, tranzactional, cheile stale cu `deleteField()`. Testele minim si complet HR-005 sunt PASS dupa Admin SDK read si refresh. Detaliile sunt in `09a1b-inchidere-fundatie-hr.md`.

## ETAPA 9A.1C

Rularea unificata `salariati/` plus `production-boundary.spec.ts` a trecut cu **20 PASS** (1 setup Auth si 19 cazuri aplicative). S-a adaugat un loading/error/retry explicit pentru abonarea la `hrTimesheets` din fisa salariatului. Nu exista mecanism de fault injection local pentru a forta numai acest abonament sa esueze; calea UI este implementata, iar exercitarea erorii ramane limitare de testabilitate.

HR-013 confirma o contradictie de autorizare: UI refuza departamentele pentru dispecer, dar regulile Firestore curente permit `read, write: if true` pentru orice document. Aceasta este documentata ca BUS-01/politica nedefinita; nu s-au modificat regulile pentru a inventa o politica.

## Neexecutat in 9A.1C

- Contractele complete de dialog (focus trap, Tab/Shift+Tab, Escape, X, click exterior, responsive si double-submit) pentru toate dialogurile HR.
- Matricea completa HR-013 la nivel Firestore Rules/API pentru fiecare operatie.
- Regresiile Condica, Kiosk, Core si istoricul 107/107, cleanup dublu si production-boundary in aceeasi runda.

## Verdict

Verdictul final este consemnat in `09a1d-gate-final-fundatie-hr.md`.

HR-005 este PASS. Contractele dialogurilor si regresia unificata sunt PARTIAL. Nu au fost incepute HR-014, HR-015, HR-016, REP, RES, staging sau live.

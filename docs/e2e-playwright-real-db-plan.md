# E2E Playwright Real DB - Plan etapizat

Acest document este backlog-ul executabil pentru suita Playwright remote pe `https://fom-nrg.vercel.app`.

Regula de baza: testele pot rula pe baza reala, dar orice date create trebuie marcate cu `E2E_RUN_*` sau `E2E_`, iar rularile mutating necesita `E2E_RUN_MUTATING=true`.

## Configurare

Variabile necesare:

```bash
E2E_BASE_URL=https://fom-nrg.vercel.app
E2E_ADMIN_EMAIL=...
E2E_ADMIN_PASSWORD=...
E2E_TECH_EMAIL=...
E2E_TECH_PASSWORD=...
E2E_KIOSK_EMAIL=...
E2E_KIOSK_PASSWORD=...
```

Pentru teste care scriu in baza reala:

```bash
E2E_RUN_MUTATING=true
E2E_RUN_PREFIX=E2E_RUN_YYYYMMDDHHMMSS
```

Pentru fluxurile reale de pontaj nu mai trebuie setate manual salariatul sau ID-ul lui. Testele apeleaza endpoint-ul admin `/api/e2e/attendance-fixture`, care:

- foloseste contul `E2E_TECH_EMAIL` ca utilizator tehnician de test;
- daca tehnicianul are deja un salariat HR activ asociat prin `hrEmployees.userUid`, il reutilizeaza fara sa ii modifice datele;
- daca nu exista salariat asociat, creeaza automat departament + salariat `E2E_RUN_*` si seteaza `userUid`;
- returneaza automat `employeeId` si `employeeName` catre testele kiosk/field/condica.

Observatii:

- Fake clock functioneaza doar daca build-ul remote a fost deployat cu `NEXT_PUBLIC_E2E_TEST_MODE=true`; altfel testul foloseste timpul real si poate astepta regula de 1 minut la field checkout.
- `E2E_RUN_PREFIX` este optional; daca lipseste, testele genereaza automat `E2E_RUN_<timestamp>`.
- Testul de re-sync manual foloseste pagina `/dashboard/resurse-umane/pontaj/sync`, care proceseaza ziua curenta. Se ruleaza doar cand setezi explicit `E2E_RUN_MUTATING=true`.
- Optional, pentru verificari exacte de calcul UI poti seta `E2E_ATTENDANCE_EXPECTED_BANK` si `E2E_ATTENDANCE_EXPECTED_C1`...`E2E_ATTENDANCE_EXPECTED_C7`; daca lipsesc, testul verifica doar existenta zonelor de calcul.

## Comenzi

- `npm run test:e2e:real:setup-auth`
- `npm run test:e2e:real:stage0`
- `npm run test:e2e:real:hr-readonly`
- `npm run test:e2e:real:hr-mutating`
- `npm run test:e2e:real:requests`
- `npm run test:e2e:real:approvals`
- `npm run test:e2e:real:kiosk`
- `npm run test:e2e:real:lucrari`

## Etapa 0 - infrastructura remote

Status: `IMPLEMENTED_READONLY`

Scop: login real pe roluri, storage state separat si smoke pe URL-urile critice.

Acoperire:

- Admin: `/dashboard/resurse-umane/salariati`, profil salariat fixture, departamente, condica, cereri-aprobari, rapoarte.
- Tehnician: `/dashboard/cereri`, `/dashboard/lucrari`.
- Kiosk: `/kiosk`.
- Captura console errors, page errors, screenshot/video/trace la failure.

Acceptanta:

- Utilizatorul nu ajunge in `/login`.
- Pagina se incarca fara erori critice de browser.
- Redirect-urile pe roluri sunt corecte.

## Etapa 1 - Admin HR read-only si dialog inventory

Status: `IMPLEMENTED_READONLY`

Scop: inventariere dialoguri si validari fara a salva date.

Acoperire:

- Salariati: lista, dialog adaugare, validare nume/prenume obligatorii.
- Salariati: program standard/pauza standard, normalizare ore si alert global fara executie.
- Salariati: switch `Status activ`, input poza profil si checkbox departament in dialogul de adaugare.
- Salariati: cautare si dialog editare fara salvare.
- Profil salariat: taburi, card asociere utilizator, pontaj, cereri, poza profil.
- Profil salariat: dialog `Cerere noua de concediu`, KPI zile, tipuri CO/CFP/CM/DEL, camp document medical si camp client delegatie.
- Departamente: dialog creare/editare/stergere fara confirmare destructiva, validare nume.
- Condica: luna, view compact/detaliat, legenda, dialog adaugare, dialog stergere, sarbatori legale, export CSV disponibil.
- Condica: dialog adaugare cu intervale dinamice, pauze dinamice, `Traseu la client`, includere concedii/evenimente/sarbatori/weekend.
- Condica: dialog stergere cu checkbox timp/pauza si submit blocat cand formularul este incomplet.
- Condica: sarbatori legale cu add/list/delete draft fara salvare.
- Rapoarte: tab pontaj si tab ore suplimentare.

Acceptanta:

- Dialogurile se deschid si se inchid stabil.
- Validarile obligatorii apar fara mutatii.
- Zonele fara fixture sunt marcate `BLOCKED`, nu fortate.

## Etapa 2 - Admin HR mutating controlat

Status: `PARTIAL_MUTATING`

Scop: operatii reale, dar izolate prin `E2E_RUN_*`.

Acoperire:

- Creeaza departament `E2E_RUN_*`, verifica persistenta, editeaza, activeaza/dezactiveaza, refresh, cleanup.
- Verifica gap-ul `userUid` la creare salariat.
- Blocheaza explicit formularul de salariat nou daca nu exista control de asociere `userUid`.
- `TODO`: creare salariat E2E complet si asociere user existent dupa fixul UI/API pentru `userUid`.
- `TODO`: verificare dependente kiosk/cereri/pontaj dupa asociere.

Acceptanta:

- Datele create sunt identificabile dupa prefix.
- Testele mutating nu ruleaza fara `E2E_RUN_MUTATING=true`.
- Bugurile gasite se noteaza aici si se repara inainte de etapa urmatoare.

## Etapa 3 - Tehnician cereri

Status: `IMPLEMENTED_READONLY_AND_MUTATING_GUARDED`

Scop: cereri reale create de tehnician.

Acoperire:

- Tipuri inventariate in dialog: `CO`, `CFP`, `CM`, `IN`, `DEL`, `CORRECT_HOURS`, `ADD_OVERTIME`.
- Validari read-only: submit blocat pe payload incomplet, CM expune document medical, overtime expune durata, corectare pontaj expune intervale/pauze.
- Corectare pontaj: adauga interval, adauga pauza, stergere interval/pauza blocata/corecta fara submit.
- Overtime: dropdown ore/minute si preview durata cu granularitate 30 minute.
- Lista cereri si detalii cerere existenta daca exista fixture.
- `TODO_MUTATING`: creare cereri reale `E2E_RUN_*`, overlap, CM cu fixture file si descarcare document.

Acceptanta:

- Contul tehnician trebuie sa aiba `hrEmployees.userUid` asociat.
- Cererile create sunt marcate cu motiv `E2E_RUN_*`.
- Documentele generate/descarcate nu blocheaza rularile headless.

## Etapa 4 - Admin aprobari si condica

Status: `IMPLEMENTED_READONLY`

Scop: aprobarea cererilor si sincronizarea in condica.

Acoperire:

- Tabs pending/toate si empty states.
- Detalii cerere, document disponibil, edit dialog si refuz dialog fara submit.
- Respingere: motiv obligatoriu verificat prin buton dezactivat, apoi activat dupa completarea motivului, fara submit.
- Condica: sync/export vizibile si popover zi daca exista data.
- Condica: UI real pentru banca ore si C1-C7 pe fixture E2E.
- Condica: re-sync manual prin `/dashboard/resurse-umane/pontaj/sync`, rulat doar cu `E2E_RUN_MUTATING=true`.
- `TODO_MUTATING`: aprobare/respingere/stergere pending doar pe cereri `E2E_RUN_*` create in etapa 3.
- `TODO_MUTATING`: verificare condica dupa aprobare, zile protejate si conflicte.

Acceptanta:

- Cererea aprobata produce efect vizibil in condica.
- Respingerea cere motiv.
- Editarea unei cereri aprobate resincornizeaza condica sau raporteaza clar conflictul.

## Etapa 5 - Kiosk si pontaj

Status: `IMPLEMENTED_READONLY_AND_MUTATING_GUARDED`

Scop: pontaj kiosk cu camera/geolocatie controlate de Playwright.

Acoperire:

- Lista utilizatori eligibili.
- Excludere salariat fara `userUid`.
- Start/Stop pana la confirmarea parolei, fara check-in/check-out real.
- Logout kiosk cere parola si nu deconecteaza fara confirmare.
- Start/Stop real kiosk cu camera fake si geolocatie fake, apoi verificare condica pe fixture.
- Dublu start si stop fara sesiune activa.
- Locatie refuzata: fallback birou sau eroare clara, cu cleanup daca start-ul reuseste.
- Camera refuzata: selfie obligatoriu blocheaza start-ul kiosk.

Acceptanta:

- Kiosk permite doar useri eligibili.
- Selfie este obligatoriu in kiosk.
- Sesiunea poate fi reconciliata in condica dupa sync.

### Acoperire calcule pontaj/condica

Status: `IMPLEMENTED_DETERMINISTIC`

Acoperire existenta prin teste locale deterministe:

- `lib/hr/time-calc.test.ts`: parse ore, intervale suprapuse, pauze suprapuse, pauza manuala invalida cu fallback la pauza default, pauza care se suprapune partial cu timpul lucrat.
- `lib/attendance/sync-timesheet-merge.test.ts`: sync pontaj real in condica, pastreaza overtime aprobat, pastreaza intrari manuale, elimina pontaj vechi generat, protejeaza zile `CO/CFP/CM/IN`, pastreaza coduri compatibile `DEL/WE/SL`, aplica pauza default sau pauza manuala, ignora intervale invalide, normalizeaza pontaje suprapuse.
- `lib/hr/request-timesheet-sync.test.ts`: `ADD_OVERTIME`, `CORRECT_HOURS`, `IN`, idempotenta, stergere intervale/pauze generate de cereri, recalcul ore dupa stergere.
- `lib/hr/timesheet-summary.test.ts`: zile lucrate, tichete de masa, ore prezenta, banca de ore, traseu client/casa, CO/DEL/IN, C1-C7, sarbatori/weekend si export CSV.
- `lib/hr/overtime-report.test.ts`: reconciliere cerere overtime cu pontaj real, partial/missing/difference, toleranta 1 minut, program default, fara double-count pe intervale suprapuse.
- Harness E2E local `e2e/pontaj-full.spec.ts`, `e2e/pontaj-human.spec.ts`, `e2e/condica-summary.spec.ts`: fluxuri simulate de pontaj, sync condica, overtime si sumar.

Acoperire verificata local:

- `npx tsx --test lib/hr/time-calc.test.ts lib/hr/request-timesheet-sync.test.ts lib/hr/timesheet-summary.test.ts lib/attendance/sync-timesheet-merge.test.ts lib/hr/overtime-report.test.ts`
- Rezultat curent: `69` teste trecute.

Acoperire real DB adaugata:

- Start/Stop real kiosk cu selfie upload si geolocatie fake, apoi verificare directa in condica.
- Start/Stop real field din `/dashboard/lucrari`, apoi sync in condica.
- Dublu start, stop fara sesiune activa, camera refuzata, locatie refuzata/fallback birou.
- Re-sincronizare manuala prin pagina admin `/dashboard/resurse-umane/pontaj/sync`, protejata de `E2E_RUN_MUTATING=true`.
- Verificare UI pentru C1-C7/banca de ore pe fixture E2E; valorile exacte se pot valida cu env-urile `E2E_ATTENDANCE_EXPECTED_*`.

Ce ramane conditionat de fixture/deployment:

- Verificare exacta C1-C7 dupa pontaje cu ore controlate necesita `NEXT_PUBLIC_E2E_TEST_MODE=true` in deployment sau asteptare reala.
- Cleanup complet al sesiunilor/condicii din Firestore trebuie facut doar pentru documente `E2E_RUN_*`.

Regula pentru aceste fluxuri real DB:

- Nu se ruleaza pe conturi personale/reale; `E2E_TECH_EMAIL` trebuie sa fie cont tehnician de test.
- Se foloseste `E2E_TECH_EMAIL` ca user tehnician de test; daca nu are salariat HR asociat, se creeaza automat salariat `E2E_RUN_*` + departament + manager.
- Toate sesiunile/datele au prefix `E2E_RUN_*`, apoi se verifica in condica si se curata unde este sigur.

## Etapa 6 - Lucrari tehnician

Status: `IMPLEMENTED_READONLY_AND_MUTATING_GUARDED`

Scop: fluxuri tehnician pe lucrari.

Acoperire:

- Lista, empty state, cautare, detalii lucrare unde exista fixture.
- Actiuni disponibile pe rol tehnician.
- Pontaj field: expune Start/Stop sau motiv blocare HR.
- Raport: buton disponibil/dezactivat inventariat.
- Pontaj field start/stop cu camera si geolocatie fake, apoi verificare condica.
- Camera refuzata continua field pontaj fara selfie, apoi cleanup prin stop.
- Locatie refuzata blocheaza start field fara sesiune activa.
- `TODO_MUTATING`: raport minim, validari si finalizare unde exista lucrare `E2E_RUN_*` dedicata.

Acceptanta:

- Nu se modifica lucrari reale fara fixture `E2E_RUN_*`.
- Daca nu exista lucrare dedicata, testul marcheaza `BLOCKED`.

## Registru buguri

| Data | Etapa | Scenariu | Rezultat actual | Rezultat asteptat | Severitate | Link trace/screenshot | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## Observatii initiale

- Configul Playwright local existent ramane pentru harness/local.
- Suita remote foloseste `playwright.real.config.ts`.
- Inventarul curent listeaza `51` teste Playwright in `8` fisiere.
- Selectorii existenti sunt partial accesibili; unde apar teste fragile se adauga `data-testid` punctual.
- `userUid` nu este setat in dialogul actual de creare salariat, deci Etapa 2 trebuie sa documenteze/fixeze acest gap.

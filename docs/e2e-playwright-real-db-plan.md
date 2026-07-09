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

Status: `TODO`

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

Status: `TODO`

Scop: inventariere dialoguri si validari fara a salva date.

Acoperire:

- Salariati: lista, dialog adaugare, validare nume/prenume obligatorii.
- Profil salariat: taburi, card asociere utilizator, pontaj, cereri, poza profil.
- Departamente: dialog creare/editare/stergere fara confirmare destructiva.
- Condica: luna, filtre, popover celula, sarbatori legale, export CSV disponibil.
- Rapoarte: tab pontaj si tab ore suplimentare.

Acceptanta:

- Dialogurile se deschid si se inchid stabil.
- Validarile obligatorii apar fara mutatii.
- Zonele fara fixture sunt marcate `BLOCKED`, nu fortate.

## Etapa 2 - Admin HR mutating controlat

Status: `TODO`

Scop: operatii reale, dar izolate prin `E2E_RUN_*`.

Acoperire:

- Creeaza departament `E2E_RUN_*`, verifica persistenta.
- Creeaza salariat `E2E_RUN_*`, verifica program, pauza, departament, manager.
- Verifica gap-ul `userUid` la creare salariat.
- Asociaza user existent, verifica dependente kiosk/cereri/pontaj.

Acceptanta:

- Datele create sunt identificabile dupa prefix.
- Testele mutating nu ruleaza fara `E2E_RUN_MUTATING=true`.
- Bugurile gasite se noteaza aici si se repara inainte de etapa urmatoare.

## Etapa 3 - Tehnician cereri

Status: `TODO`

Scop: cereri reale create de tehnician.

Acoperire:

- Tipuri: `CO`, `CFP`, `CM`, `IN`, `DEL`, `CORRECT_HOURS`, `ADD_OVERTIME`.
- Validari: lipsa departament, lipsa manager, date lipsa, overlap, CM fara document, overtime invalid.
- Lista cereri si status pending.

Acceptanta:

- Contul tehnician trebuie sa aiba `hrEmployees.userUid` asociat.
- Cererile create sunt marcate cu motiv `E2E_RUN_*`.
- Documentele generate/descarcate nu blocheaza rularile headless.

## Etapa 4 - Admin aprobari si condica

Status: `TODO`

Scop: aprobarea cererilor si sincronizarea in condica.

Acoperire:

- Detalii cerere, aprobare, respingere cu motiv obligatoriu, editare payload, stergere pending.
- Verificare condica dupa aprobare.
- Zile protejate, conflicte, export CSV si modificari manuale.

Acceptanta:

- Cererea aprobata produce efect vizibil in condica.
- Respingerea cere motiv.
- Editarea unei cereri aprobate resincornizeaza condica sau raporteaza clar conflictul.

## Etapa 5 - Kiosk si pontaj

Status: `TODO`

Scop: pontaj kiosk cu camera/geolocatie controlate de Playwright.

Acoperire:

- Lista utilizatori eligibili.
- Excludere salariat fara `userUid`.
- Start/Stop normal.
- Camera refuzata, fallback locatie birou, dublu start, stop fara sesiune activa, logout kiosk.

Acceptanta:

- Kiosk permite doar useri eligibili.
- Selfie este obligatoriu in kiosk.
- Sesiunea poate fi reconciliata in condica dupa sync.

## Etapa 6 - Lucrari tehnician

Status: `TODO`

Scop: fluxuri tehnician pe lucrari.

Acoperire:

- Lista, filtre, cautare, detalii lucrare.
- Actiuni disponibile pe rol tehnician.
- Pontaj field start/stop cu camera si geolocatie fake.
- Raport minim, validari si finalizare unde exista fixture dedicat.

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
- Selectorii existenti sunt partial accesibili; unde apar teste fragile se adauga `data-testid` punctual.
- `userUid` nu este setat in dialogul actual de creare salariat, deci Etapa 2 trebuie sa documenteze/fixeze acest gap.

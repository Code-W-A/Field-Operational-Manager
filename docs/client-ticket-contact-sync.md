# Sincronizarea datelor clientului

La editarea unui document `clienti`, `onClientContactDetailsChanged` creează un job. `processClientContactSyncPage` parcurge tichetele în pagini de 100, prin `clientId`, `clientInfo.id`, apoi numele vechi exact. Numele de client trebuie să fie unic pentru tichetele fără ID. Locația și contactul se identifică prin ID sau printr-o potrivire exactă, unică, cu datele sursă anterioare.

Sunt eligibile inclusiv tichetele `Finalizat`. Sunt excluse cele arhivate sau anulate, inclusiv marcajele `archivedAt`, `archived`, `anulat`, `anulatAt`. Rapoartele, PDF-urile, produsele și versiunile ofertelor nu sunt în lista câmpurilor modificabile.

Tranzacția recitește clientul și tichetul. Fiecare câmp existent se actualizează numai dacă încă are valoarea sursei anterioare sau valoarea înregistrată în `contactSync.values`. Valorile goale fără proveniență cunoscută și excepțiile manuale sunt păstrate. Pentru `clientInfo` se scriu căi individuale; pentru array-ul `persoaneContact`, Firestore necesită scrierea listei, dar tranzacția păstrează apartenența, ordinea, proprietățile suplimentare și câmpurile manuale ale fiecărui element.

`contactSync` păstrează ID-urile sursei, valorile urmărite și conflictele. Asocierile imposibile și excepțiile se raportează în `clientContactSyncIssues/{ticketId}` și sunt afișate în pagina tichetului. `clientContactSyncJobs` păstrează cursorul, starea, numărul de documente procesate și eventualele erori (`lastError`, `lastFailedAt`, `failedAttempts`). Un job neterminat este reluat de mecanismul de retry al funcției; pagina următoare și finalizarea paginii curente sunt scrise atomic. Sursele din job conțin doar date de identificare/contact, fără echipamente sau documente emise. Evenimentele vechi recitesc întotdeauna sursa actuală.

Formularul salvează `contactId`. Reintervenția se precompletează din fișa actuală și recitește sursa în `addLucrare` înainte de creare. Excepțiile introduse explicit în noul formular se păstrează. La asociere ambiguă sau ștearsă, utilizatorul trebuie să selecteze locația/contactul; o eroare de citire blochează crearea. Pagina afișează valorile tichetului, inclusiv excepțiile și valorile goale, fără a le masca prin datele live. Destinatarii ofertelor/devizelor respectă ID-ul contactului selectat; un ID șters sau o asociere ambiguă nu selectează alt contact după nume.

## Raport și corecții selectate

Instrumentul necesită un proiect explicit și credențiale Admin disponibile separat. Nu face parte din deploy și nu a fost rulat pe producție.

```sh
npm run reconcile:ticket-contacts -- --project PROJECT_ID --output /tmp/contacte-raport.json
```

Implicit se fac doar citiri. Raportul conține diferențe candidate, nu o clasificare automată a lor ca erori: pot fi excepții intenționate. Asocierile imposibile sunt în `issues` și necesită selecție explicită în aplicație. Fișierul de ieșire existent nu este suprascris.

După revizuirea raportului, creați o selecție explicită:

```json
[
  { "ticketId": "ID_TICHET", "fields": ["telefon", "persoanaContactEmail", "clientInfo.locationAddress"] }
]
```

```sh
npm run reconcile:ticket-contacts -- --project PROJECT_ID --apply --report /tmp/contacte-raport.json --selection /tmp/contacte-selectie.json
```

Aplicarea verifică în tranzacție aceeași asociere, statutul și valorile înainte/după din raport. Schimbările concurente sunt omise și raportate în `skipped`. Numai câmpurile selectate se modifică; documentele arhivate/anulate rămân intacte. `persoaneContact.<index>.<camp>` verifică și ID-ul contactului sursă, pentru a evita aplicarea pe alt element după reordonare.

## Verificare locală

```sh
npm --prefix firebase-functions run build
npm run test:client-contact-sync
```

Testele de integrare au protecție pentru emulator și folosesc exclusiv proiectul `demo-fom-contact-sync`. Într-un terminal separat, porniți configurația izolată (Firebase CLI, Java și dependențele Functions trebuie să fie instalate):

```sh
npm run test:client-contact-sync:emulators
```

Scriptul generează configurația în directorul temporar, pornește Firestore la `8180` și Functions la `5501` și exportă numai cele două funcții de sincronizare. Celelalte funcții ale aplicației nu sunt încărcate: nu sunt necesare notificări sau alte efecte externe. Opriți emulatorul cu Ctrl+C după teste.

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npm run test:client-contact-sync:emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 npm run test:client-contact-sync:browser
```

Primul test verifică triggerul real, 102 tichete/paginarea, duplicatele, ordinea inversată, concurența, arhivele, snapshoturile și CLI-ul de reconciliere. Al doilea folosește componentele reale `LucrareForm`/`TicketContactDetails`, citiri Firestore din server și `addLucrare`, cu autentificare/navigare auxiliare simulate; verifică refresh-ul la salvare, excepțiile manuale, contacte omonime, lipsa trimiterilor de email și erorile de citire/asociere. Acesta este un test izolat al componentelor și serviciilor, nu o verificare a producției.

## Publicare separată

Sunt necesare aplicația Next.js și ambele funcții noi: `onClientContactDetailsChanged`, `processClientContactSyncPage`, în `europe-west1`. Publicarea nu repară automat diferențele istorice deja existente; raportul și aplicarea selectivă sunt pași separați. Nu este necesară migrarea obligatorie a documentelor existente.

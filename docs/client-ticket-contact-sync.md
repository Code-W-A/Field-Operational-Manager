# Sincronizarea datelor clientului

## Afișarea actuală în detaliile tichetului (Next.js)

Pagina de detalii folosește un resolver separat, `resolveTicketLiveDisplay`, și o singură abonare `useTicketClient` la clientul asociat. Componentele de afișare primesc același rezultat. Abonarea se închide la schimbarea tichetului/asocierii, sesiunii sau la demontare; rezultatele vechi sunt ignorate. Nu sunt necesare funcții noi, indexuri, migrare sau scrieri la afișare.

Datele existente se înlocuiesc **doar pentru afișare** dacă lipsesc sau coincid cu proveniența `contactSync.values` pentru aceeași asociere. Valorile manuale, golurile fără proveniență și diferențele istorice neclasificabile se păstrează și se semnalează. Firma, locația și contactul se rezolvă separat. ID-urile invalide nu sunt înlocuite prin potrivire după nume. Tichetele arhivate/anulate folosesc exclusiv valorile salvate. Pentru o asociere fără ID, este acceptată numai potrivirea exactă, unică, confirmată de server.

În caz de client șters, lipsă acces sau lipsă conexiune, pagina afișează copia tichetului și un mesaj discret. Prima citire a clientului rămâne separată pentru consumatorii existenți de documente/echipamente: actualizările de afișare nu înlocuiesc obiectul tichetului, intrările PDF/email sau formularul nesalvat. Listele, workerul și celelalte ecrane păstrează comportamentul anterior în această etapă. Operațiunile preexistente ale paginii (de exemplu marcarea notificării ca citită) nu sunt parte din noul mecanism de afișare.

Formularul deschis din detalii activează `preserveContactDraft`: actualizările fișei clientului nu suprascriu automat lista de contacte din editarea nesalvată. Selectarea explicită a locației/contactului rămâne disponibilă. „Preia datele actuale ale contactului” confirmă folosirea datelor actuale pentru contactul selectat, inclusiv când ID-ul acestuia nu s-a schimbat; modificarea intră în baza de date numai la salvarea formularului. Celelalte utilizări ale formularului nu activează această opțiune.

Verificări izolate:

```sh
npm run test:ticket-live-display
npm run test:ticket-live-display:browser
```

Testul browser pornește numai Firestore, pe portul `8281`, în proiectul `demo-fom-ticket-display`, cu reguli temporare care nu permit scrieri din browser. Folosește hook-ul, componentele și formularul reale; autentificarea/navigarea și componentele auxiliare sunt simulate. Verifică actualizarea afișării, prezentarea pentru roluri, excepțiile, confirmarea explicită, formularul nesalvat, asocierile legacy, erorile, dezabonarea și faptul că valorile/`updateTime` ale tichetelor nu se schimbă. Nu reprezintă o verificare integrală a paginii autentificate sau a producției. Revertul acestor modificări de afișare nu necesită restaurarea datelor.

## Sincronizarea copiilor salvate (comportament existent)

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


## Extindere Next.js: fișa clientului, lista și documentele noi

- Numărătoarea și fișa clientului folosesc `clientId`, apoi `clientInfo.id`. Potrivirea după nume se aplică numai fără ID și pentru nume exact unic. Un client redenumit își păstrează tichetele legate prin ID; copiile legacy fără ID și cu numele anterior nu sunt ghicite.
- Fișa ascultă interogări restrânse după cele două ID-uri și, dacă este verificat unic, după numele legacy. Rezultatele sunt deduplicate; ambiguitatea apărută ulterior elimină imediat potrivirea legacy. Istoricul deschis din fișă nu mai aplică suplimentar numele vechi peste filtrul de ID. Regulile de acces existente rămân neschimbate.
- Lista activă folosește același resolver conservator ca pagina tichetului. `useWorkClients` citește numai clienții necesari tichetelor încărcate, în grupuri de maximum 30 de ID-uri/nume distincte; numărul rândurilor cu același client nu multiplică abonările. Arhivele/anulările păstrează copiile istorice. Căutarea, filtrele și coloanele folosesc proiecția, iar editarea/salvarea folosesc obiectele brute.
- O versiune nouă de ofertă/deviz și prima generare de raport citesc clientul de pe server și salvează un `clientSnapshot` v1 separat. Identitatea firmei (denumire, CUI, ONRC, adresă) vine din fișa actuală; contactul/locația respectă excepțiile și golurile manuale. O asociere nesigură sau eroare de citire blochează explicit salvarea/generarea nouă cu mesaj, înainte de scriere. Documentele existente nu primesc completări retroactive.
- Snapshotul se fixează la salvarea versiunii, respectiv prima generare a raportului. Redescărcarea, atașamentul acelei versiuni și oferta certificată/publică folosesc aceeași identitate. Pentru date noi se creează o versiune nouă, inclusiv când produsele nu se schimbă. Destinatarul emailului continuă să fie verificat separat din datele actuale.
- `devizClientSnapshot` urmărește devizul curent/restaurat; `raportSnapshot.clientSnapshot` păstrează identitatea raportului și a fișelor de revizie regenerate. Versiunile fără acest câmp păstrează comportamentul anterior. Adăugarea versiunilor folosește `arrayUnion`, ca o salvare concurentă să nu șteargă versiunile altui operator.

Verificări: `npm run test:client-consistency`, `npm run test:client-contact-sync`, `npm run test:ticket-live-display`, `npm run test:offer-pdf-input`, `npm run test:ticket-live-display:browser`, `node scripts/test-work-document-recipient.mjs`, build Next.js. Browserul izolat verifică și formularele reale ofertă/deviz, fără emailuri ori servicii de producție; acesta nu certifică autentificarea/permisiunile din producție. Nu există migrare, modificare de reguli Firestore, oprire a workerului sau deploy în această etapă. Revenirea codului ignoră câmpurile noi, fără restaurarea bazei de date.

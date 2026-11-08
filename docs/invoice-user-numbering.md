# Planul 2 — etapa 2: numerotare pe utilizator

Implementare locală, 8 noiembrie 2026. Niciun apel SAGA, cont real configurat sau publicare.

## Comportament

Până la activare, numerotarea generală existentă funcționează la fel. În **Setări → SAGA → Numerotare pe utilizator**, adminul selectează profilurile pregătite în etapa 1, previzualizează valorile și confirmă activarea. Profilurile eligibile aparțin unor conturi active admin/dispecer; maximum 20 se activează într-o operațiune. Lista are paginare de 25.

Prima activare schimbă modul firmei în `per_user`. Profilurile activate ulterior se adaugă în același mod. Utilizatorul fără profil activ poate salva ciorna, dar nu poate pregăti un XML nou. Nu există revenire automată la seria generală și nu se atribuie seria altui utilizator.

Seria este aleasă exclusiv după UID-ul din identitatea Firebase verificată, la confirmarea pregătirii XML. Nu după autorul tichetului sau ultimul editor. Câmpurile UID/prefix trimise arbitrar în cererea facturii nu schimbă alegerea serverului. Rolurile existente rămân neschimbate.

În editor se afișează utilizatorul emitent, seria și **Număr estimat — nerezervat**. Estimarea și previzualizarea sunt numai citiri. Deschiderea/salvarea ciornei nu alocă numere. Rezervarea și salvarea XML-ului se fac în aceeași tranzacție; erorile generatorului sau depășirea dimensiunii acceptate anulează și incrementarea.

Preview-ul include profilul, revizia profilului, modul firmei, seria și revizia contorului. Dacă se schimbă utilizatorul, profilul sau contorul, confirmarea răspunde `409` și cere o previzualizare nouă. Două pregătiri pornite din aceeași estimare nu primesc același număr: una reface previzualizarea după conflict.

După pregătire, snapshot-ul și rezervarea păstrează identitatea emitentului. Retry-ul sau redeschiderea de alt operator autorizat returnează aceeași factură și aceiași octeți XML. Facturile și rezervările vechi nu sunt renumerotate. O rezervare fără document, incompatibilă cu snapshot-ul curent, răspunde `RESERVATION_RECONCILIATION`, fără alt număr și fără modificarea rezervării existente.

## Contoare și corecții

Se reutilizează `invoiceCounters/{sha256([codFiscal,prefix])}`. Seriile sunt exclusive între profiluri, deci fiecare profil activ are propriul contor prin seria sa. Nu se resetează la schimbarea anului.

Pentru un contor nou, seed-ul și lățimea provin din ultima valoare numerică verificată în profil. Dacă există contor, seed-ul numeric și lățimea trebuie să coincidă exact cu starea lui pentru prima activare; altfel activarea este respinsă. După corectarea profilului, contorul compatibil este reutilizat fără rescriere sau resetare. Un profil deja activ folosește contorul avansat, nu seed-ul inițial.

Activarea adaugă în profil `numbering: {counterId, activatedAt, activatedBy}` și crește revizia. Prefixul și valoarea inițială devin imuabile în API-ul profilurilor, inclusiv înainte de prima alocare. Agentul poate fi actualizat cu protecția obișnuită de revizie; nu se pierde legătura cu contorul.

Din **Corectează înainte un contor activ**, adminul alege profilul, introduce noua ultimă valoare verificată și motivul, previzualizează și confirmă. Sunt permise numai creșteri stricte. Se păstrează prefixul, lățimea minimă și numărul de alocări. Corecția nu schimbă valoarea inițială a profilului și nu emite facturi. Există audit al activărilor și corecțiilor.

Configurația generală din `invoiceNumbering/{codFiscal}` este păstrată. După activarea modului pe utilizator, API-ul vechi de configurare generală refuză modificările cu `USER_MODE_ACTIVE`; interfața indică noua zonă de administrare.

## API și persistare

- `GET /api/integrations/saga/numbering/users?cursor=` — admin; modul și revizia firmei, profiluri, conturi și contoare.
- `POST .../users/preview` — admin; previzualizare fără scrieri.
- `POST .../users/activate` — admin; confirmare atomică, aceleași date și `confirmationHash` întors de preview.

Activare:

```json
{"expectedRevision":0,"profiles":[{"uid":"UID_FOM","expectedRevision":1}]}
```

Corecție, separat de activare:

```json
{"expectedRevision":1,"profiles":[],"correction":{"uid":"UID_FOM","lastVerifiedNumber":"260010","reason":"Ultima valoare verificată"}}
```

`expectedRevision` este revizia modului firmei; reviziile profilurilor sunt verificate separat. Amprenta confirmării acoperă și contoarele și conturile curente. O modificare între preview și confirmare răspunde `409`. Confirmarea repetată cu amprenta veche cere reîncărcare; nu resetează contoare.

Modul firmei și auditul sunt în `invoiceNumbering/{codFiscal}/userNumbering/mode` și subcolecția sa `audit`. Metadatele activării sunt în profilurile existente `sagaCatalogs/{codFiscal}/issuerProfiles/{uid}`. Colecțiile sunt deja excluse din accesul Firestore direct; nu sunt necesari indecși sau reguli noi.

Estimarea existentă `/api/lucrari/{id}/invoice-draft/number` păstrează câmpurile anterioare și adaugă `issuer`. Snapshot-ul XML și rezervarea adaugă opțional metadatele numerotării pe utilizator. Documentele istorice nu necesită migrare, iar structura fiscală XML și versiunea generatorului rămân aceleași. Agentul nu primește câmp fiscal nou în această livrare.

Sunt păstrate autorizarea Firebase strictă, verificarea contului activ, izolarea după firma configurată pe server și bariera `SAGA_READS_ENABLED`. Nu sunt necesare variabile noi. Activarea reală necesită configurația și regulile de protecție existente, dar nu este executată de implementare sau teste.

## Fișiere și verificare

Modificările sunt în serviciile/modelul numerotării și XML-ului, blocarea profilurilor active, rutele noi, panoul administrativ și afișarea estimării/previzualizării în editor. Serviciul nou este `lib/invoicing/user-numbering.server.ts`, componenta nouă `components/settings/user-invoice-numbering-settings.tsx`, iar scriptul dedicat `scripts/test-user-invoice-numbering.ts`.

Rezultat: suita dedicată și toate cele patru suite de regresie de mai jos au trecut, inclusiv verificările în browser.

Comenzi:

- `npm run test:invoice-user-numbering:integration` — emulatoare Auth/Firestore pe proiectul demo izolat `demo-fom-user-numbering`, cu refuzul traficului HTTP extern. Verifică activarea, lipsa scrierilor la preview, contoare independente, conflict concurent pe aceeași serie, UID falsificat, profil lipsă/neactivat, cont dezactivat, schimbări după preview, seed/prefix imuabile, corecție numai înainte, contor compatibil reutilizat, bariera scrierilor, rollback după eroare XML, rezervare orfană, istoric, izolare între firme și refuzul Firestore direct. Browserul verifică componentele reale prin API/Auth/Firestore: activare din Setări, estimare, editor flotant, pregătire/reîncărcare, lățimi 320/390 px. Capturi locale `/tmp/fom-user-numbering-{ticket,settings}-mobile.png`.
- `npm run test:invoice-numbering` — 4 teste unitare trecute.
- `npm run test:invoice-xml` — 8 teste unitare trecute.
- Regresii API/emulator/browser trecute: `npm run test:invoice-numbering:integration`, `npm run test:invoice-xml:integration`, `npm run test:saga:references:integration` și `npm run test:saga:integration`.
- TypeScript: 212 diagnostice preexistente înainte și după; fără diagnostice noi la compararea mesajelor fără poziții.

Testele folosesc numai date fictive. Nu dovedesc configurarea seriilor/conturilor clientului sau compatibilitatea importului într-o firmă SAGA reală. Publicarea și activarea efectivă sunt pași separați. Regulile comerciale, prețul/TVA pe linie, scadența și agentul fiscal rămân în etapa următoare.

## Continuare — etapa 3

Editorul și regulile comerciale sunt implementate local, cu activare separată pe firmă. [Autocompletare, preț protejat, TVA pe linii, scadență și note](invoice-commercial-rules.md).

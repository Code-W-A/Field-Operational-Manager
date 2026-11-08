# Ciorna facturii din tichet — etapa 1

Actualizare 7 noiembrie 2026: catalogul reutilizabil de produse/gestiuni și consultarea stocului în editor sunt implementate local; detalii în [saga-connection.md](saga-connection.md#catalog-si-ciorna-facturii--7-noiembrie-2026). Salvarea ciornei rezolvă asocierile pe server, fără apel SAGA. Consultarea stocului pornește numai prin buton.

Blocul **Facturare** apare imediat după **Deviz** pentru admin/dispecer. Tichetul trebuie preluat; raportul final nu este obligatoriu. Desktop: editor nemodal, deplasabil cu antetul sau săgețile tastaturii, minimizabil. Sub 768 px: formular în fluxul paginii.

## Date și salvare

- `GET /api/lucrari/{workId}/invoice-draft`: ciorna salvată sau precompletare fără scriere. `?source=1` pregătește explicit o nouă precompletare.
- `PUT` primește `{ expectedRevision, content, refreshSource? }`. `content` conține beneficiarul, data/scadența, moneda RON, liniile, TVA-ul și reducerea globală. Totalurile, referințele și autorul nu sunt acceptate din browser ca valori autoritative.
- Autentificare Firebase prin `requireVerifiedRole`, verificare suplimentară a rolului/stării utilizatorului, tranzacție cu revizie. `409 REVISION_CONFLICT` păstrează editările locale și permite compararea versiunii salvate.
- O singură ciornă în `invoiceDrafts/{workId}`. Regulile Firestore exclud atât documentele, cât și subcolecțiile din accesul direct al clienților SDK.
- Prioritate linii: ciorna salvată → deviz salvat → raport tehnic, inclusiv lista goală → produse din tichet. Nu se adaugă automat manoperă/deplasare. Nu se asociază automat clienți cu nume ambiguu.
- TVA zero se păstrează; fără deviz se folosește `predefinedSettings/offers_default_vat_percent`. Totaluri în bani, cu aritmetică zecimală și rotunjire half-up pe linie, apoi reducere globală și TVA.
- Se acceptă valori lipsă, semnalate în formular; numerele nevalide se resping. Maximum 100 de poziții, 4 zecimale la cantitate/preț/procente. Sursele cu peste 100 de linii au avertisment explicit.
- Liniile pot avea o asociere opțională `saga`: firma, produsul stabil din catalog, revizia produsului, gestiunea și revizia ei. Snapshotul articolului/gestiunii este completat exclusiv de server. Ciornele vechi funcționează fără migrare. O asociere modificată/inactivă produce `409 CATALOG_CONFLICT`; operatorul poate actualiza ori elimina asocierea, păstrând editările.
- Editarea ciornei nu modifică tichetul/clientul/devizul. Reimportarea și renunțarea la modificări au confirmări în editor.
- Arhivat/anulat/facturat/„Nu se facturează”: nu se creează o ciornă nouă, iar ciorna existentă este doar pentru citire.

## Verificare locală

```sh
npm run test:invoice-draft
npm run test:invoice-draft:integration
```

Integrarea pornește emulatoare Auth/Firestore pentru proiectul izolat `demo-fom-invoice-draft` (porturi 9398/8398), verifică handler-ele HTTP cu tokenuri Firebase și editorul React real în Chrome headless, cu stilurile aplicației. Sunt necesare Firebase CLI, Java și Chrome. Nu folosește date de producție.

Acoperă precompletarea, TVA/discount/zecimale, permisiuni, acces Firestore direct refuzat, două salvări concurente, reimport, păstrarea modificărilor la conflict, minimizare/închidere, deplasare cu mouse/tastatură, lățimi de 320/390 px, salvare/redeschidere și consultare readonly. Capturi locale: `test-results/invoice-draft/`.

Separat au fost verificate compilarea locală a rutei Next.js și refuzul autentificării numai cu cookie-ul `userRole`. Typecheck-ul global are erori preexistente; comparația înainte/după nu a identificat diagnostice noi pentru această implementare.

Etapa nu emite facturi fiscale, nu alocă numere, nu generează PDF, nu trimite la SAGA și nu descarcă stoc. Nu schimbă `statusFacturare`, `numarFactura`, `facturaDocument` sau regulile raportului de nefacturate. Publicarea aplicației și a regulilor Firestore nu a fost efectuată; regulile trebuie livrate împreună cu funcționalitatea. Testarea pe telefon fizic rămâne separată de verificarea în browser.

Verificare 7 noiembrie 2026: `test:invoice-draft` (10 teste), `test:invoice-draft:integration` și `test:saga:catalog` au trecut local. Ultimul acoperă selecția din catalog de către dispecer, cantitățile cumulate, UM, invalidarea rezultatelor, conflictele de asociere și păstrarea datelor la salvare/redeschidere. Transportul SAGA este simulat; Auth/Firestore și browserul sunt reale, izolate de producție.

## Clientul SAGA al facturii — 7 noiembrie 2026

Editorul consultă `GET /api/lucrari/{id}/invoice-draft/client-association` pentru legătura clientului tichetului cu lista SAGA importată în FOM. Afișează codul, denumirea, țara, CUI-ul și eventualele lipsuri/neconcordanțe, cu actualizare explicită și link spre clientul FOM. Datele beneficiarului deja editate nu sunt înlocuite; un CUI diferit este semnalat fără blocarea salvării unei ciorne incomplete. Nu sunt necesare modificări sau migrări ale documentelor `invoiceDrafts`. Implementare și verificări: [saga-clients.md](saga-clients.md).

## Numărul estimat al facturii — 7 noiembrie 2026

Editorul afișează „Număr estimat — nerezervat”, din `GET /api/lucrari/{id}/invoice-draft/number`. Ciorna nu apelează alocatorul și nu consumă numere la deschidere, editare, salvare sau redeschidere. Configurarea și serviciul intern tranzacțional sunt descrise în [invoice-numbering.md](invoice-numbering.md). Nu se modifică schema ciornei sau câmpurile legacy de facturare.

## XML numerotat pregătit în FOM

Etapa 3 este implementată local: profil fiscal confirmat, câmpuri structurate opționale pentru beneficiar, previzualizare și confirmare explicită pentru rezervarea atomică a numărului, snapshot/XML privat și înghețarea ciornei. Fără apeluri SAGA și fără schimbarea statusurilor contabile. Compatibilitatea SAGA rămâne neverificată. [Utilizare, protecții și verificări](invoice-xml.md).

## Planul 2 — reguli comerciale

Etapa 3 adaugă versiunea comercială 2 a ciornei, cu activare pe firmă și conversie explicită a ciornelor existente. Prețul/UM/TVA provin din verificarea API salvată, TVA-ul este pe linii, iar scadența și notele sunt păstrate separat. [Utilizare, protecții și teste](invoice-commercial-rules.md).

## Planul 2 — curs EUR informativ

Etapa 4 adaugă propunerea BNR pentru data facturii și păstrarea explicită în ciornă/document. Totalurile RON rămân identice. [API, cache, omiterea confirmată și teste](invoice-eur-reference.md).

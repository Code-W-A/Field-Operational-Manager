# Ciorna facturii din tichet — etapa 1

Blocul **Facturare** apare imediat după **Deviz** pentru admin/dispecer. Tichetul trebuie preluat; raportul final nu este obligatoriu. Desktop: editor nemodal, deplasabil cu antetul sau săgețile tastaturii, minimizabil. Sub 768 px: formular în fluxul paginii.

## Date și salvare

- `GET /api/lucrari/{workId}/invoice-draft`: ciorna salvată sau precompletare fără scriere. `?source=1` pregătește explicit o nouă precompletare.
- `PUT` primește `{ expectedRevision, content, refreshSource? }`. `content` conține beneficiarul, data/scadența, moneda RON, liniile, TVA-ul și reducerea globală. Totalurile, referințele și autorul nu sunt acceptate din browser ca valori autoritative.
- Autentificare Firebase prin `requireVerifiedRole`, verificare suplimentară a rolului/stării utilizatorului, tranzacție cu revizie. `409 REVISION_CONFLICT` păstrează editările locale și permite compararea versiunii salvate.
- O singură ciornă în `invoiceDrafts/{workId}`. Regulile Firestore exclud atât documentele, cât și subcolecțiile din accesul direct al clienților SDK.
- Prioritate linii: ciorna salvată → deviz salvat → raport tehnic, inclusiv lista goală → produse din tichet. Nu se adaugă automat manoperă/deplasare. Nu se asociază automat clienți cu nume ambiguu.
- TVA zero se păstrează; fără deviz se folosește `predefinedSettings/offers_default_vat_percent`. Totaluri în bani, cu aritmetică zecimală și rotunjire half-up pe linie, apoi reducere globală și TVA.
- Se acceptă valori lipsă, semnalate în formular; numerele nevalide se resping. Maximum 100 de poziții, 4 zecimale la cantitate/preț/procente. Sursele cu peste 100 de linii au avertisment explicit.
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

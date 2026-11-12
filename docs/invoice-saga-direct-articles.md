# Produse SAGA direct în factura tichetului

Implementare locală: **10 noiembrie 2026**. Fără publicare, activarea importurilor reale sau apeluri către firma SAGA în timpul dezvoltării/verificărilor.

## Fluxul curent — 11 noiembrie 2026

Editorul flotant are doi pași, datele facturii și produsele/stocul. La deschiderea pasului de produse, FOM citește raportul `GetSituatieStocuri` direct prin conectorul SAGA și returnează lista în aceeași cerere. Raportul rămâne în memoria paginii. Selectarea tipului, gestiunii și căutarea după cod/denumire filtrează imediat acest răspuns. Actualizarea listei și redeschiderea editorului pornesc o citire nouă.

Lista nu este salvată sau recitită din `selectionCache` ori `selectionSnapshots` în Firestore. Înregistrările istorice din aceste colecții rămân neutilizate. Firebase continuă să protejeze autentificarea și cheia rotită a conexiunii, precum și datele facturii și asocierile produselor selectate.

La alegerea articolului, `GetArticol` citește UM, TVA și prețul protejat, apoi `GetStocArticol` citește stocul gestiunii. Adăugarea confirmă moneda RON și păstrează verificările existente pentru cantități cumulate, produse dezactivate și gestiuni permise. Serviciile sau gestiunile absente din raport nu apar în selecție.

Răspunsul include dovezi HMAC pentru fiecare rând, legate de firma conectată, utilizator și tichet. Serverul verifică integritatea rândului și expirarea de zece minute la preluare, consultarea stocului și aplicare. Verificarea funcționează între instanțe server diferite și nu necesită persistarea raportului. Datele produsului selectat sunt păstrate în oferta temporară existentă. Reîncărcarea listei nu invalidează alte alegeri încă valabile. O eroare la actualizare semnalează lista anterioară ca indisponibilă pentru adăugare până la o citire reușită.

Limita răspunsului JSON este 4 MiB, pentru încadrarea în limita transportului aplicației. Prima încărcare depinde de durata raportului SAGA. Dropdownurile ulterioare folosesc răspunsul primit. Spinnerul rămâne disponibil la încărcarea inițială, citirea articolului, stocului și adăugare.

Regulile comerciale, numerotarea, XML-ul și transmiterea păstrează validările existente. Ciornele vechi aplică explicit regulile comerciale înainte de folosirea acestui flux. Salvarea asocierii produsului nu salvează automat ciorna.

## Linia unificată a facturii — 11 noiembrie 2026

Fiecare linie conține direct tipul, gestiunea și căutarea articolului după denumire/cod. Codul, UM, TVA și prețul sunt completate din SAGA, iar operatorul editează cantitatea și informațiile suplimentare. „Adaugă produs” creează o linie nouă. Toate liniile folosesc același răspuns API păstrat în memoria editorului.

Selectarea unui articol cu moneda RON deja confirmată aplică automat datele pe aceeași linie după citirea articolului și a stocului. Prima utilizare cere confirmarea monedei și „Confirmă articolul”. Stocul insuficient sau problemele comerciale sunt afișate pe linie. Schimbarea tipului, gestiunii sau căutării elimină asocierea anterioară din ciornă, astfel încât alegerea incompletă să fie verificată la emitere. Înlocuirea păstrează identificatorul liniei, cantitatea și notele.

Testul `test:invoice-commercial:integration` a trecut pentru selecția integrată, aplicarea automată a articolului cunoscut, confirmarea inițială, cantități cumulate, preț protejat, păstrarea editărilor la navigare/minimizare, salvare/redeschidere și XML. Browserul a fost verificat la 320/390 px, cu transport SAGA simulat. Screenshotul local este `/tmp/fom-saga-two-step-mobile.png`.

## Backend și protecții

- `POST /api/lucrari/[id]/invoice-draft/saga-article/preview`: `{code, expectedRevision}`. Verifică identitatea, rolul, contul activ, eligibilitatea tichetului, politica și documentul înghețat; citește articolul cu `readForInvoice`. Salvează privat în `sagaCatalogs/{firma}/articleLookups` oferta temporară, legată de utilizator, tichet, reviziile ciornei/politicii și amprenta surselor. Valabilitate: zece minute. Răspunsul include identificatorul, datele comerciale, problemele și gestiunile permise. Deschiderea pasului de produse citește raportul SAGA. Previzualizarea articolului citește `GetArticol`.
- `POST /api/lucrari/[id]/invoice-draft/saga-article/apply`: `{previewId, quantity, warehouseId, kind, confirmRON}`. Nu acceptă preț/UM/TVA din browser. Reverifică oferta și salvează atomic produsul, referința comercială și legăturile necesare, în colecțiile existente `products`, `referenceItems`, `commercialBindings`. Returnează linia fără salvarea ciornei. Retry-ul aceleiași selecții returnează aceeași linie; sursele schimbate produc `409`.
- Ruta existentă `POST /api/lucrari/[id]/invoice-draft/stock` acceptă suplimentar `{previewId, warehouseId, kind}` pentru articolul încă neadăugat. Payload-ul vechi rămâne acceptat. Codul și gestiunea sunt rezolvate pe server; sursele sunt verificate înainte și după apel. Parametrul opțional `data` nu este trimis pentru acest flux.
- Articolele noi au ID determinist după firmă/tip/cod; concurența nu produce duplicate. Cele existente își păstrează ID-urile. Codurile rămân text, cu zerouri inițiale. Referința unei gestiuni lipsă poate fi creată din gestiunea activă deja configurată de admin, fără pretenția unei verificări online a nomenclatorului.
- `ReferenceEntry.operatorConfirmation` păstrează moneda, tipul, UID-ul și data, separat de `exportData` și `apiSnapshot`. Validarea comercială acceptă RON confirmat de operator dacă moneda lipsește din export; moneda disponibilă în export are prioritate. Un import ulterior păstrează confirmarea și auditul operatorului, precum și snapshot-ul API.
- O nouă citire cu aceleași valori comerciale păstrează reviziile și snapshot-ul sursei existente, pentru a nu invalida prima linie la adăugarea repetată. Valorile schimbate avansează revizia și cer reconciliere explicită. Previzualizarea afișează momentul noii citiri.
- Colecția temporară este protejată de excluderea existentă pentru întregul `sagaCatalogs`. Nu sunt necesare indexuri compuse noi. Expirarea este verificată pe server; nu a fost configurată ștergere automată TTL. Limite: 512 KiB/ofertă și 500 de gestiuni în catalog pentru acest flux.
- Autentificarea Bearer, firma, blocajul și criptarea/rotația cheii sunt cele ale conectorului existent. Nu sunt necesare variabile de mediu noi; configurarea și barierele existente rămân aplicabile.

## Stoc și finalizare

Stocul insuficient este avertizare în ciornă, fără rezervare. Eroarea este afișată distinct ca **Stoc neconfirmat**, cu reîncercare, niciodată ca zero. Schimbarea articolului/gestiunii elimină rezultatul anterior; schimbarea cantității recalculează avertizarea fără apel nou. Serviciile nu folosesc gestiune sau stoc.

Fluxul principal folosește [**Emite și trimite în SAGA**, cu o singură confirmare](invoice-finalization.md). Workerul existent citește stocul înainte, transmite XML-ul unic și recitește după import. Importul și citirile înainte/după/diferența observată sunt afișate separat. Reverificarea nu retransmite factura. Nu introducem endpointuri de descărcare/validare și nu marcăm automat „Validată contabil”. Statusurile contabile ale tichetului rămân neschimbate.

**Scăderea efectivă a stocului și mecanismul validării în SAGA rămân neconfirmate practic.** Pilotul real rămâne un pas separat, controlat și autorizat.

## Verificări executate

- `test:invoice-commercial` **8/8**, `test:invoice-saga` **9/9**, `test:saga` **8/8**, `test:saga:references` **8/8**: **33 de teste trecute**.
- `test:invoice-commercial:integration`: **trecut**, API/emulator și browser. Articole fără import pentru ambele roluri, proprietarul ofertei, expirare, surse schimbate, preț falsificat, monedă absentă/străină, UM incompatibilă, preț lipsă/zero, TVA lipsă/zero, servicii, gestiuni interzise, concurență/retry, ciornă nesalvată, linii repetate, salvare/redeschidere și pregătire XML. Browser: activarea explicită din editor fără consum de număr, Enter, confirmările primei utilizări, stoc automat, cantități cumulate, stoc insuficient, eroare/reîncercare/zero și 320/390 px. Captură locală: `/tmp/fom-saga-direct-mobile.png`.
- `test:invoice-saga:integration`: **trecut**, API/emulator/browser. Succes/parțial/eșec/timeout, stoc neschimbat, concurență, întrerupere, import unic, reverificare numai GET, raport privat, rotație, simulare și păstrarea statusului nefacturat.
- `test:saga:integration`: **trecut**, cu transport injectat. Roluri, persistența criptată a tokenului pe succes/eroare, concurență, execuție întreruptă și timeout.
- Toate verificările folosesc emulatoare și date simulate, fără SAGA real și fără publicare. Răspunsul stock 503 din log este eroarea simulată intenționat. Eroarea EUR_FUTURE_DATE din scenariul vechi reflectă diferența dintre data browserului și ceasul fix al fixture-ului; nu este probă de eroare EUR în producție.
- Typecheck global: persistă diagnosticele existente. Comparația normalizată înainte/după arată același set de 122 de diagnostice distincte, fără diagnostice adăugate sau erori în noul flux. `git diff --check` a trecut.

## Fișiere

- `components/invoicing/invoice-saga-article.tsx`, integrat în `invoice-draft-section.tsx`.
- `lib/invoicing/saga-article.server.ts`, `saga-article-http.ts`, `saga-article-runtime.server.ts` și rutele `preview/apply/stock`.
- `lib/saga/references.ts`, `lib/saga/references.server.ts` și `lib/invoicing/commercial.server.ts`: proveniență și validare RON.
- `scripts/test-invoice-commercial.ts`: scenariile noi.

Modul dry-run și activarea separată a importurilor nu au fost schimbate. Nu au fost atinse modificările paralele din zona ofertelor sau invitațiilor de utilizatori.

Actualizare 10 noiembrie: dacă nu există gestiuni active permise, adminul poate introduce gestiunea în același editor. Nu se extind permisiunile produselor existente; cantitatea locală se păstrează la recitirea articolului. [Configurarea simplificată](invoice-user-setup.md).

## Verificări ale listei directe — 11 noiembrie 2026

- `npm run test:invoice-commercial:integration` a trecut cu Auth/Firestore emulator și transport SAGA simulat. Verifică răspunsul de 4.641 rânduri, absența documentelor de cache, citiri noi la fiecare cerere, falsificarea dovezilor, izolarea firmei/utilizatorului/tichetului, expirarea și verificarea pe o instanță separată.
- Browserul verifică spinnerul la răspuns întârziat, selecțiile dependente și căutarea fără cereri suplimentare, citirea articolului/stocului, prețul protejat, cantitățile cumulate, salvarea/redeschiderea și ecranele de 320/390 px.
- `tsc --noEmit` raportează 212 diagnostice preexistente, fără diagnostice în fișierele modificate pentru lista directă. `git diff --check` a trecut.
- Testele acestei modificări folosesc răspunsuri simulate. Durata reală a raportului SAGA nu a fost măsurată în această etapă. Publicarea rămâne separată.

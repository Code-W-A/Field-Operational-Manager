# Produse SAGA direct în factura tichetului

Implementare locală: **10 noiembrie 2026**. Fără publicare, activarea importurilor reale sau apeluri către firma SAGA în timpul dezvoltării/verificărilor.

## Utilizare

1. În ciorna facturii, apasă **Adaugă produs din SAGA**, introdu codul exact și apasă **Preia din SAGA** sau Enter.
2. FOM citește denumirea, UM, TVA și `Pret_Vanzare1` prin conectorul existent. Valorile nu sunt editabile în acest formular.
3. Pentru un articol neconfigurat, alege explicit **marfă/serviciu** și confirmă moneda **RON**. Acestea sunt confirmări ale operatorului în FOM, separate de datele furnizate de API.
4. Pentru marfă, alege gestiunea și cantitatea. Stocul este consultat automat la selectarea gestiunii; cantitatea cumulată include liniile repetate din aceeași firmă/articol/gestiune.
5. Apasă **Adaugă în factură**, apoi salvează ciorna. Asocierea se păstrează în FOM, fără emitere, numerotare sau transmitere în acest pas.

Adminul și dispecerul pot adăuga articole, fără import de referințe. Gestiunile sunt configurate o singură dată de admin. Pentru articole existente nu extindem automat gestiunile permise; articol dezactivat, UM schimbată sau monedă străină cer corectare administrativă.

Regulile comerciale trebuie să fie active. Adminul le poate activa explicit din editor, după prezentarea efectului asupra firmei. Dispecerul este informat; politica nu se activează automat. Ciornele vechi păstrează **Aplică regulile SAGA**, cu previzualizare și confirmare. O ciornă nouă nesalvată poate utiliza fluxul fără salvare preliminară. Documentele înghețate rămân numai pentru citire.

## Backend și protecții

- `POST /api/lucrari/[id]/invoice-draft/saga-article/preview`: `{code, expectedRevision}`. Verifică identitatea, rolul, contul activ, eligibilitatea tichetului, politica și documentul înghețat; citește articolul cu `readForInvoice`. Salvează privat în `sagaCatalogs/{firma}/articleLookups` oferta temporară, legată de utilizator, tichet, reviziile ciornei/politicii și amprenta surselor. Valabilitate: zece minute. Răspunsul include identificatorul, datele comerciale, problemele și gestiunile permise. Deschiderea formularului nu apelează SAGA.
- `POST /api/lucrari/[id]/invoice-draft/saga-article/apply`: `{previewId, quantity, warehouseId, kind, confirmRON}`. Nu acceptă preț/UM/TVA din browser. Reverifică oferta și salvează atomic produsul, referința comercială și legăturile necesare, în colecțiile existente `products`, `referenceItems`, `commercialBindings`. Returnează linia fără salvarea ciornei. Retry-ul aceleiași selecții returnează aceeași linie; sursele schimbate produc `409`.
- Ruta existentă `POST /api/lucrari/[id]/invoice-draft/stock` acceptă suplimentar `{previewId, warehouseId, kind}` pentru articolul încă neadăugat. Payload-ul vechi rămâne acceptat. Codul și gestiunea sunt rezolvate pe server; sursele sunt verificate înainte și după apel. Parametrul opțional `data` nu este trimis pentru acest flux.
- Articolele noi au ID determinist după firmă/tip/cod; concurența nu produce duplicate. Cele existente își păstrează ID-urile. Codurile rămân text, cu zerouri inițiale. Referința unei gestiuni lipsă poate fi creată din gestiunea activă deja configurată de admin, fără pretenția unei verificări online a nomenclatorului.
- `ReferenceEntry.operatorConfirmation` păstrează moneda, tipul, UID-ul și data, separat de `exportData` și `apiSnapshot`. Validarea comercială acceptă RON confirmat de operator dacă moneda lipsește din export; moneda disponibilă în export are prioritate. Un import ulterior păstrează confirmarea și auditul operatorului, precum și snapshot-ul API.
- O nouă citire cu aceleași valori comerciale păstrează reviziile și snapshot-ul sursei existente, pentru a nu invalida prima linie la adăugarea repetată. Valorile schimbate avansează revizia și cer reconciliere explicită. Previzualizarea afișează momentul noii citiri.
- Colecția temporară este protejată de excluderea existentă pentru întregul `sagaCatalogs`. Nu sunt necesare indexuri compuse noi. Expirarea este verificată pe server; nu a fost configurată ștergere automată TTL. Limite: 512 KiB/ofertă și 500 de gestiuni în catalog pentru acest flux.
- Autentificarea Bearer, firma, blocajul și criptarea/rotația cheii sunt cele ale conectorului existent. Nu sunt necesare variabile de mediu noi; configurarea și barierele existente rămân aplicabile.

## Stoc și finalizare

Stocul insuficient este avertizare în ciornă, fără rezervare. Eroarea este afișată distinct ca **Stoc neconfirmat**, cu reîncercare, niciodată ca zero. Schimbarea articolului/gestiunii elimină rezultatul anterior; schimbarea cantității recalculează avertizarea fără apel nou. Serviciile nu folosesc gestiune sau stoc.

Păstrăm **Pregătește XML**, apoi **Finalizează și trimite în SAGA**. Workerul existent citește stocul înainte, transmite XML-ul unic și recitește după import. Importul și citirile înainte/după/diferența observată sunt afișate separat. Reverificarea nu retransmite factura. Nu introducem endpointuri de descărcare/validare și nu marcăm automat „Validată contabil”. Statusurile contabile ale tichetului rămân neschimbate.

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

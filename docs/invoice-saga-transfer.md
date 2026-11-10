# Finalizarea facturii: import SAGA și observarea stocului

Implementare locală: **8 noiembrie 2026**. Extinde ciorna, XML-ul numerotat, catalogul și conectorul existente. Modul implicit este **dry-run**, cu simulări separate. Nu au fost activate importuri reale și nu au fost publicate aplicația, regulile, indexurile sau funcțiile.

## Fluxul operatorului

1. Apasă **Emite și trimite în SAGA** (în dry-run: **Simulează emiterea și trimiterea**). Ciorna se salvează automat, apoi se afișează rezumatul și stocul. [Fluxul unificat — 10 noiembrie 2026](invoice-finalization.md).
2. Confirmă o singură dată în editor. Numerotarea, XML-ul și operațiunea persistentă se salvează în aceeași tranzacție. Renunțarea la rezumat nu consumă număr.
3. Dacă există deja un document pregătit, numărul și XML-ul sunt reutilizate integral. Reîncărcarea paginii și repetarea cererii returnează aceeași operațiune.
4. Workerul citește stocul curent pe cod articol + gestiune, cumulând liniile repetate. Serviciile nu au stoc. Stocul insuficient sau o citire eșuată opresc transmiterea; o eroare nu devine zero.
5. Workerul transmite exact XML-ul înghețat, apoi citește din nou aceleași grupuri. Interfața arată separat rezultatul importului și rezultatul verificării, cu momentele/cantitățile înainte/după.
6. **Reverifică stocul (fără retrimitere)** reia numai GET-urile, folosind citirea inițială salvată. Reluarea este permisă după terminarea procesării, când există o bază completă de comparație. O operațiune oprită înainte de orice trimitere poate relua verificarea inițială prin confirmare explicită.

Dacă importul este confirmat și diferența nu este observată integral, mesajul este: **Factură importată în SAGA; scăderea stocului nu este confirmată.**

„Diferența așteptată a fost observată” înseamnă strict `înainte − după = cantitatea cumulată facturată`, prin aritmetică zecimală exactă. Nu dovedește singură că această factură a provocat mișcarea sau că documentul este validat contabil. Alte mișcări SAGA pot interveni între citiri. FOM nu modifică stocul local pentru a simula un succes real.

`numarFactura`, `statusFacturare`, `facturaDocument` și raportul de nefacturate nu sunt modificate. Metadatele documentului XML rămân înghețate; interfața prezintă acum documentul pregătit și stările SAGA separat.

## Contractul SAGA și XML

Surse verificate: [API SAGA Web](https://web.sagasoft.ro/DocumentatieAPI), [articol oficial](https://www.sagasoftware.ro/saga-web-api-uri-pentru-dezvoltatori/), [manual SAGA C](https://manual.sagasoft.ro/sagac/topic-76-import-date.html). API-ul Web are prioritate. Manualul C descrie suplimentar structura XML și distinge importul de validarea documentelor; comportamentul Web trebuie confirmat practic.

- `GET /api/v20260225/Situatii/GetStocArticol?codArticol=...&gestiune=...`. Nu trimitem `data`, pentru citirea curentă SAGA. Codurile sunt text, inclusiv zerourile inițiale.
- `POST /api/v20260225/Import`, multipart cu **file** și **importAutomat=true**. Autentificare Bearer + `X-Saga-Cod-Fiscal`, fără redirect sau retry automat al POST-ului.
- `200` cere `success:true`/`Success:true` explicit și necontradictoriu. `200` cu false este eșec; corp neinterpretabil/contradictoriu este incert. `207` este parțial și cere reconciliere, `422` este eșec cu raport, `400` cu refuz JSON explicit este respingere. Răspunsurile necunoscute/ambigue/trunchiate nu devin succes.
- Tokenul reînnoit este salvat criptat înainte de interpretarea corpului, inclusiv pentru răspunsurile de eroare. Citirile și importurile folosesc același lease `sagaConnections`; întreruperile ori erorile de persistare păstrează protecția `needs_review` existentă.
- Generatorul nou folosește **XMLBuilder** din `fast-xml-parser`, versiunea generatorului **2**, cu aceleași calcule și validări. Documentele existente, inclusiv versiunea 1, nu sunt regenerate. Înainte de transmitere se verifică SHA-256, XML-ul fără DTD/entități declarate, identitatea/numărul/datele, codurile, UM, gestiunile, cantitățile și valorile față de snapshot.
- Asocierile trebuie să fie încă active și compatibile cu snapshot-ul. O schimbare a clientului, articolului sau gestiunii nu schimbă automat factura înghețată; trimiterea este oprită pentru verificare.

## Persistență și procesare independentă de browser

- `invoiceSagaTransfers/{sha256([codFiscal, workId])}`: operațiune reală/test, SHA XML, număr, autor, revizie, fază, lease, cursor, stări de import și stoc, grupuri/citiri, încercări și raport.
- `invoiceSagaSimulations/{același identificator}`: operațiuni dry-run complet separate. Nu citesc SAGA și nu modifică tokenul sau conexiunea reală. Schimbarea modului nu transformă o simulare în import real.
- `invoiceSagaCompanyLeases/{mock|live}-{codFiscal}`: serializează fluxurile FOM ale aceleiași firme pe durata citire → import → verificare. Nu blochează alte aplicații sau operatori în SAGA.
- `invoiceSagaReports/{mock|live}-{transferId}/chunks/{index}`: raport privat, redacționat de cheile cunoscute/header-ele Bearer, fragmentat la maximum 180.000 de octeți per document. Răspunsul upstream este limitat la 1 MiB; trunchierea păstrează un rezultat incert. Descărcarea verifică hash-ul raportului.

Workerul Next.js procesează câte un pas persistent: o citire, importul sau o verificare. Lease-ul pasului este 90 s, iar lease-ul fluxului pe firmă este reînnoit la 120 s. Timeoutul conectorului rămâne 20 s. Citirile inițiale mai vechi de 10 minute opresc transmiterea și cer reluare explicită.

**Limita ireversibilă este persistată după obținerea lease-ului conexiunii și înainte de POST.** Dacă execuția se întrerupe după această limită, recuperarea marchează rezultatul incert. Nici timeoutul, nici importul parțial, nici un rezultat pierdut nu declanșează alt POST. Un procesor vechi nu poate suprascrie rezultatul unui procesor care a recuperat operațiunea. Nu este promisă idempotența externă prin GUID-urile SAGA.

Firebase Functions pornește workerul la crearea operațiunii și la reluarea explicită a unei operațiuni terminale. Modificările intermediare nu pornesc alte execuții. O funcție programată la fiecare minut recuperează până la cinci operațiuni pentru firma/modul configurate; dispatcherul face pași timp de maximum 200 s, apoi continuarea rămâne persistentă pentru următoarea execuție. Intervalele verificărilor sunt respectate între pași; după o întrerupere recuperarea poate avea întârzierea schedulerului.

Nu există retransmitere administrativă automată sau suprascriere a rezultatului contabil în această livrare. Pentru import parțial/incert este necesară verificarea manuală în SAGA. O reverificare de stoc nu poate transforma singură importul incert într-un import confirmat.

## API și autorizare

| Metodă / rută | Comportament |
| --- | --- |
| `POST /api/lucrari/[id]/invoice-saga` | `{sha256, operationId}`; returnează `202` și operațiunea persistentă |
| `GET /api/lucrari/[id]/invoice-saga` | Configurare publică sigură + progres; fără trafic SAGA sau scrieri |
| `POST /api/lucrari/[id]/invoice-saga/recheck` | Reluare exclusiv a citirilor, `202` |
| `GET /api/lucrari/[id]/invoice-saga/report` | Text attachment privat, `no-store`, fără URL public |
| `POST /api/internal/saga-worker` | `{transferId, simulation}`, autorizat numai prin secretul workerului |

Rutele utilizatorului cer identitate Firebase verificată și rol admin/dispecer activ. Identitatea firmei vine din configurația serverului și documentul înghețat, nu din corpul cererii. Colecțiile de operațiuni, simulări, rapoarte și lease-uri sunt excluse din accesul Firestore direct, inclusiv pentru admin și subcolecții. Cheia SAGA nu este configurată în Firebase Functions și nu ajunge în browser/rapoarte/loguri.

## Configurare — nu a fost activată/publicată

Pe backendul **Next.js/Vercel**, peste variabilele SAGA existente:

```dotenv
SAGA_IMPORT_MODE=dry-run
SAGA_IMPORTS_ENABLED=false
SAGA_STOCK_CHECK_ATTEMPTS=3
SAGA_STOCK_CHECK_INTERVAL_MS=5000
SAGA_WORKER_SECRET=<secret base64url de 32 octeti, 43 caractere>
```

Interval acceptat: 1.000–60.000 ms; încercări: 1–5. O valoare invalidă oprește integrarea. Secretul poate fi generat separat prin `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"`; nu se copiază în frontend sau documentație.

Bariera existentă `SAGA_READS_ENABLED` se aplică și scrierilor operațiunilor/simulărilor: pentru a porni procesarea trebuie să fie `true`, exclusiv după publicarea regulilor de protecție sau într-un proiect demo cu emulatoare. `dry-run` continuă să nu facă apeluri SAGA, indiferent de această barieră.

Pentru apeluri reale **numai în firma de test**, sunt necesare suplimentar:

```dotenv
SAGA_IMPORT_MODE=test
SAGA_IMPORTS_ENABLED=true
SAGA_READS_ENABLED=true
SAGA_TEST_COD_FISCAL=<CIF firma de test, egal cu SAGA_COD_FISCAL>
SAGA_TEST_FIRM_CONFIRMED=true
```

`SAGA_API_KEY` trebuie să fie cheia firmei de test, iar profilul emitentului, catalogul și clientul asociat trebuie pregătite pentru acea firmă. Nu înlocuiți credențialele firmei reale pentru un test accidental. Modul `production` necesită activare explicită și reprezintă un pas separat, după acceptarea testului practic.

Pe **Firebase Functions**, fără cheia SAGA:

```dotenv
SAGA_WORKER_ENABLED=true
SAGA_WORKER_APP_URL=https://<domeniul aplicatiei Next.js>
SAGA_WORKER_COD_FISCAL=<acelasi CIF configurat in Next.js>
SAGA_IMPORT_MODE=dry-run
```

`SAGA_WORKER_SECRET` se configurează prin Secret Manager și se leagă la cele trei funcții. Trebuie să fie identic cu secretul serverului Next.js. Pentru teste live, modul se schimbă în `test` atât pe Functions, cât și pe Next.js. HTTP localhost este acceptat numai în emulatorul Functions; în cloud este necesar HTTPS. URL-ul trebuie să fie originea aplicației, fără cale/query/credențiale și accesibil workerului; protecția suplimentară Vercel trebuie configurată separat dacă domeniul este protejat.

Funcții noi: `onInvoiceSagaTransferQueued`, `onInvoiceSagaSimulationQueued`, `processPendingSagaTransfers`. Înaintea activării se publică explicit **regulile Firestore, indexurile și aceste funcții**, apoi aplicația și configurația. Indexurile noi acoperă `fiscalCode`, `mode`, `phase`, `nextAt`. În dezvoltare se rulează workerul în infrastructura de emulare; simpla deschidere a paginii nu procesează operațiuni. Fără worker configurat, operațiunile rămân în așteptare.

## Testul practic 10 → 2 → 8

Script: `npm run test:invoice-saga:live`. **Nu a fost executat.** Nu încarcă automat `.env` sau `.env.local` și nu revine la credențiale de producție.

Necesită configurația test de mai sus, credențiale Firebase server pentru un proiect de test confirmat și:

```dotenv
SAGA_TEST_ALLOW_IMPORT=true
SAGA_TEST_NO_CONCURRENT_MOVEMENTS=true
SAGA_TEST_FIREBASE_CONFIRMED=true
SAGA_TEST_FIREBASE_PROJECT_ID=<egal cu NEXT_PUBLIC_FIREBASE_PROJECT_ID>
SAGA_TEST_WORK_ID=<tichet cu XML deja pregatit, un articol, cantitate 2>
SAGA_TEST_OPERATOR_UID=<UID admin activ>
```

Articolul/gestiunea trebuie să aibă exact 10 bucăți, fără alte mișcări pe durata testului. Scriptul refuză o factură cu operațiune deja existentă, verifică stocul inițial, folosește finalizarea reală și cere import confirmat + stoc final 8. Nu creează o factură, un articol, un număr sau o intrare de stoc de test. La eșec se verifică operațiunea existentă; nu se repetă importul pentru a „obține” rezultatul dorit.

## Fișierele acestei etape

- Conector: `lib/saga/service.server.ts`, `lib/saga/import.ts`.
- XML: `lib/invoicing/xml.ts`, `lib/invoicing/xml.server.ts` — serializer și versiune nouă, fără migrarea documentelor înghețate.
- Procesare: `lib/invoicing/saga-transfer.ts`, `saga-transfer.server.ts`, `saga-artifact.server.ts`, `saga-transfer-http.ts`, `saga-transfer-runtime.server.ts`, `saga-worker-auth.server.ts`.
- API: `app/api/lucrari/[id]/invoice-saga/route.ts`, `recheck/route.ts`, `report/route.ts`, `app/api/internal/saga-worker/route.ts`.
- Interfață: `components/invoicing/invoice-saga-panel.tsx`, `invoice-xml-panel.tsx`.
- Firebase: `firebase-functions/src/saga-dispatch.ts`, exportul din `index.ts`, `firestore.rules`, `firestore.indexes.json`.
- Verificări: `lib/invoicing/saga-transfer.test.ts`, `saga-transfer.fixtures.ts`, `firebase-functions/src/saga-dispatch.test.ts`, `scripts/test-invoice-saga.ts`, `scripts/test-saga-live-import.ts`, adaptarea fixture-ului din `scripts/test-invoice-xml.ts`, scripturile `package.json`.
- Documentație: acest document și actualizarea stării în documentele de plan/XML/conexiune.

## Dovezi și limite

Testele dedicate folosesc un proiect Firebase demo separat, transport injectat pentru SAGA și componente reale în Chromium. HTTP extern este blocat în testul de integrare; scenariul simulat 10 → 2 → 8 nu reprezintă o probă în firma SAGA reală.

Rezultate locale la 8 noiembrie 2026:

- `npm run test:invoice-saga`: **9/9** — clasificarea importurilor, dry-run/activare, rapoarte redactate, zecimale, integritatea XML/versiune istorică, autorizarea workerului, refuzul scriptului live fără consimțământ și dispatcherul Firebase pentru operațiuni noi/reluate.
- `npm run test:invoice-xml`: **8/8**; `npm run test:saga`: **8/8**. Total **25 teste unitare trecute** în aceste suite.
- `npm run test:invoice-saga:integration`: **trecut**, Auth/Firestore emulatoare și browser real. Include importul simulat 10 → 2 → 8, import parțial/eșuat/ambiguu, timeout, stoc insuficient/eroare/neschimbat, sursă modificată chiar la limita trimiterii, rapoarte mari fragmentate/trunchiate, operațiuni concurente, procesor întrerupt și răspuns întârziat, lipsa retrimiterii la reverificare, rotație criptată, acces direct refuzat, simulări izolate și tichet/raport nefacturate neschimbate. Browser: confirmare/anulare, rezultate separate, reload, raport privat, dry-run, 320/390px și continuare după închiderea paginii.
- Regresii `test:invoice-xml:integration`, `test:saga:integration`, `test:saga:catalog`: **trecute**, fiecare cu API/emulatoare și browser.
- Firebase Functions: `tsc --noEmit --project firebase-functions/tsconfig.json` **trecut**. TypeScript Next.js păstrează erorile preexistente, cu **zero diagnostice noi** față de baza înregistrată înainte de modificări.
- Capturi locale: `test-results/invoice-saga/` și `test-results/invoice-xml/`, ignorate de Git.
- Configurația pentru testul practic (`SAGA_TEST_COD_FISCAL`, tichet, operator, proiect Firebase și confirmările explicite) lipsește. Scriptul live nu a fost rulat și nu au fost folosite credențialele firmei reale. Nu au fost efectuate importuri reale, publicări sau teste pe telefon fizic. **Scăderea efectivă a mărfii și validarea contabilă în SAGA rămân neconfirmate practic.**

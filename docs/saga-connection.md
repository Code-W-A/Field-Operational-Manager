# SAGA — conexiune și consultări

Implementare locală: **6 noiembrie 2026**. Conectorul acoperă citirea unui articol și a stocului său din SAGA Web. Actualizarea locală din 7 noiembrie adaugă catalogul de asocieri în FOM și selecția/consultarea din ciorna facturii, descrise mai jos. Nu emite/importă facturi și nu modifică marfa din SAGA.

## Utilizare

Administratorul accesează **Setări → SAGA** (`/dashboard/setari?tab=saga`). Configurarea se verifică fără apel către SAGA și fără crearea unui document de conexiune. Consultarea pornește numai prin formular. Codurile articolului și gestiunii sunt text, cu zerourile inițiale păstrate.

Articolul se citește prin `GET /Situatii/GetArticol?codArticol=…`, iar stocul prin `GET /Situatii/GetStocArticol?codArticol=…&gestiune=…&data=…`. Pentru stoc, gestiunea și data sunt opționale; lipsa gestiunii înseamnă toate gestiunile, iar lipsa datei folosește data curentă SAGA. Formularul transformă data calendaristică în `dd.MM.yyyy` pe server. Sursa contractelor: [documentația oficială](https://web.sagasoft.ro/DocumentatieAPI).

## Configurare și activare

Configurația locală este consolidată în `.env.local`, ignorat de Git, cu permisiuni locale `0600`:

```dotenv
SAGA_API_KEY=<cheia initiala>
SAGA_COD_FISCAL=<codul fiscal al firmei>
SAGA_API_BASE_URL=https://web.sagasoft.ro/api/v20260225
SAGA_TOKEN_ENCRYPTION_KEY=<64 caractere hex, generate local>
SAGA_READS_ENABLED=false
```

Nu se folosesc variabile `NEXT_PUBLIC_`. Adresa este limitată la HTTPS pe domeniul oficial și la un prefix API versionat; backendul nu urmează redirecționări. Cheia de criptare este separată de cheia SAGA și trebuie păstrată stabilă, inclusiv la mutarea pe Vercel. Schimbarea ei face cheia existentă din Firestore imposibil de decriptat și oprește citirile.

**Activare:** publicați mai întâi regulile care exclud `sagaConnections` și `sagaCatalogs` atât pentru documente, cât și pentru subcolecții din accesul direct SDK/REST al clienților. Verificați refuzul citirii/scrierii directe inclusiv pentru admin. Abia apoi setați `SAGA_READS_ENABLED=true` pe server și reporniți Next.js. Acest flag este o barieră de activare explicită, nu o verificare automată a regulilor publicate.

La această implementare, un GET anonim pe un document inexistent cu ID obișnuit din colecția reală a primit `404 NOT_FOUND`, indicând că citirea ajungea la document fără refuzul regulilor. Nu a fost creată sau modificată nicio înregistrare în producție. Din acest motiv citirile reale sunt lăsate dezactivate; regulile nu au fost publicate în această sarcină.

## Backend și persistență

- `GET /api/integrations/saga/status`: configurație și starea conexiunii, fără trafic SAGA și fără secrete.
- `POST /api/integrations/saga/read`: `{ kind: "article" | "stock", code: string, warehouse?: string, date?: "YYYY-MM-DD" }`. Exclusiv `requireVerifiedRole(["admin"])`, cu reverificarea rolului și a stării utilizatorului pe server.
- În `sagaConnections/{codFiscal}` se păstrează cheia criptată AES-256-GCM, versiunea, starea, autorul și momentele operațiunii. CUI-ul este inclus în datele autentificate ale criptării. Nu se persistă XML-ul, stocul sau denumirea articolului.
- Cheia de mediu este folosită numai la inițializarea conexiunii. După aceea cheia din Firestore este autoritativă; schimbarea `SAGA_API_KEY` nu suprascrie automat o cheie deja salvată.
- Toate citirile aceleiași firme folosesc un lease comun de 90 secunde, cu proprietar și revizie, inclusiv între instanțe server. Cererea SAGA are timeout de 20 secunde; nu există retry automat.
- `X-Saga-Refresh-Token` se salvează criptat înainte de interpretarea răspunsului, inclusiv pentru erori HTTP sau erori logice SAGA. Conexiunea nu este eliberată pentru următorul apel până la încheierea persistării.
- Timeoutul, pierderea persistării ori o execuție întreruptă opresc conexiunea (`needs_review`). Un lease expirat după o execuție întreruptă nu autorizează reluarea cu cheia veche. `401/403` de la SAGA opresc conexiunea cu `authorization_error`.
- Recuperarea este administrată pe server: se verifică ultima operațiune și cheia actuală cu SAGA, apoi se înlocuiește controlat cheia criptată și starea. Această etapă nu oferă un buton de resetare și nu șterge automat documentul pentru a reveni la cheia inițială. Nu ștergeți conexiunea pentru a ocoli o stare incertă.

Răspunsurile publice conțin doar câmpurile de articol permise sau cantitatea stocului, codul consultat, gestiunea, data și momentul consultării. Răspunsurile brute și mesajele upstream nu sunt propagate. Stocul zero este afișat numai dacă SAGA confirmă un răspuns numeric zero. XML-ul invalid, entitățile/DOCTYPE, răspunsurile prea mari și valorile neinterpretabile produc eroare.

## Verificări și limite

```sh
npm run test:saga
npm run test:saga:integration
```

Integrarea rulează într-un proiect izolat `demo-fom-saga-read`, cu Firebase Auth și Firestore reale pe emulatoare (9397/8397). Transportul SAGA este injectat cu răspunsuri de test documentate; nu folosește cheia reală. Testul browser rulează componenta reală și stilurile aplicației peste handler-ele HTTP și emulatoarele reale.

Acoperire: configurație și flag de activare, criptare, permisiuni/cont dezactivat/cookie fără identitate, status fără apeluri sau scrieri, coduri cu zerouri, JSON/XML, stoc zero și eroare distincte, token reînnoit inclusiv pe erori, două instanțe concurente, lease întrerupt, pierderea persistării, timeout, acces Firestore direct refuzat și interfață la 320/390 px. Capturi locale: `test-results/saga/`.

Rezultate locale: cele 5 teste unitare SAGA și cele 10 teste de regresie ale ciornei au trecut; scriptul de integrare API/emulator/browser a trecut. Pagina Setări și rutele noi s-au compilat în Next.js; POST-ul neautentificat și statusul cerut numai cu `userRole=admin` au primit `401`. Bundle-urile JavaScript pentru browser nu conțin cheia API sau cheia de criptare reale. Typecheck-ul global păstrează erori preexistente, fără diagnostice noi față de verificarea făcută înaintea implementării.

Verificare reală din 6 noiembrie 2026: pentru firma `34272913`, articolul `WIFI4CHR3` și gestiunea `0005` (DEPOZIT 1), panoul SAGA afișează **2 BUC** la data `06.11.2026`. Prima cheie testată a fost respinsă cu `HTTP 400` și mesaj de autentificare invalidă. După configurarea de către utilizator a altei chei, `GetStocArticol` a răspuns `HTTP 200` cu stocul **2**, egal cu cel din panou. `GetArticol` a răspuns `HTTP 200` cu denumirea corectă, UM BUC, TVA 21 și prețul 128.0992.

SAGA a transmis o cheie reînnoită la citirea stocului; ea a fost salvată criptat local și actualizată în `.env.local` înaintea următorului apel. Verificarea a fost făcută prin apeluri directe locale către API, nu prin interfața FOM; nu s-a scris în Firestore, citirile FOM rămân dezactivate și regulile nu au fost publicate. Starea locală de verificare este în `.env.saga-verification.local`, ignorat de Git.

Aplicația și regulile nu au fost publicate. Asocierea locală a clienților este implementată și descrisă în [saga-clients.md](saga-clients.md). Următoarele etape sunt seria/numerotarea, XML și import de probă într-o firmă de test, apoi dovada validării și a descărcării stocului.


## Catalog si ciorna facturii — 7 noiembrie 2026

Implementat local, fără migrarea ciornelor existente:

- **Setări → SAGA → Produse și gestiuni asociate**: adminul creează/editează/dezactivează asocieri reutilizabile. Codul unui articol nou sau schimbat este verificat prin `GetArticol`; denumirea SAGA, UM și momentul verificării sunt păstrate pe server. Tipul marfă/serviciu este ales explicit de admin. Prețurile și TVA-ul ciornei nu sunt înlocuite.
- Gestiunile sunt introduse manual. Existența ori denumirea lor nu sunt prezentate drept verificate de API. Pentru marfă, adminul configurează gestiunile permise; serviciile nu au gestiuni.
- `sagaCatalogs/{codFiscal}/products/{id}` și `/warehouses/{id}` au revizie, stare activă, autor și momentul salvării. Subcolecția `/codes` asigură unicitatea codurilor prin documente rezervate tranzacțional. ID-urile produselor sunt stabile, independente de rândurile din deviz/raport. Nu se șterg documentele la dezactivare.
- `GET /api/integrations/saga/catalog`: citire admin/dispecer. `POST /api/integrations/saga/catalog/{products|warehouses}` și `PUT /api/integrations/saga/catalog/{products|warehouses}/{id}`: exclusiv admin, cu `expectedRevision`, cod, denumire și stare; produsele includ tipul și lista gestiunilor permise. Nu există operație de import contabil.
- Editorul facturii oferă căutare după cod/denumire, asociere explicită și alegerea gestiunii. Liniile fără asociere rămân editabile și pot fi salvate. Eliminarea asocierii rămâne disponibilă inclusiv când catalogul este indisponibil.
- `PUT invoice-draft` verifică firma, revizia produsului, gestiunea și revizia ei în aceeași tranzacție cu salvarea ciornei. Ignoră snapshoturile declarate de browser și completează valorile din catalog. Asocierea neactuală/inactivă produce `409 CATALOG_CONFLICT`; editările locale nu sunt înlocuite.
- `POST /api/lucrari/{id}/invoice-draft/stock` primește referința asocierii și funcționează inclusiv înainte de salvarea liniei. Adminul/dispecerul trebuie să fie activ, iar tichetul eligibil pentru ciornă. Se citește numai articolul și gestiunea configurate, pentru data curentă în Europe/Bucharest. Se reverifică asocierea după răspuns pentru a respinge schimbările concurente.
- Ruta folosește `readForInvoice` din același conector, cu același lease pe firmă și aceeași rotație criptată a cheii. Rutele generale `status/read` din Setări rămân exclusiv pentru admin.
- Stocul nu este persistat în ciornă/catalog. Rezultatul arată cantitatea, UM, gestiunea și momentul consultării. Erorile nu devin stoc zero. Schimbarea asocierii/gestiunii sau reîncărcarea reviziilor catalogului elimină rezultatul; modificarea cantității recalculează avertizarea, cumulând liniile aceleiași asocieri și gestiuni cu aritmetică zecimală. UM diferită este semnalată, fără conversii automate. Serviciile afișează „Stoc neaplicabil”.
- Atât citirile SAGA, cât și scrierile catalogului necesită `SAGA_READS_ENABLED=true`. Lista catalogului și salvarea ciornelor fără asocieri nu pornesc trafic SAGA. Publicați regulile pentru `sagaCatalogs`, `sagaConnections` și `invoiceDrafts` înaintea activării. Nu a fost schimbat mediul local sau Vercel pentru activare.

### Dovezi locale

- `npm run test:saga`: 8 teste trecute; `npm run test:invoice-draft`: 10 teste trecute.
- `npm run test:saga:catalog`: API + Auth/Firestore pe emulatoarele izolate `demo-fom-saga-catalog` (9396/8396) și componente React reale în Chrome headless, transport SAGA simulat. Permisiuni, coduri cu zerouri, token reînnoit, snapshots autoritative, conflicte, gestiuni, servicii/inactive, refuz citire/scriere Firestore direct inclusiv admin; apoi configurare admin, selecție dispecer, stoc zecimal/cumulat, zero/eroare, UM, invalidare, salvare/redeschidere, conflicte fără pierdere de date, minimizare și acces la tichetul din spate, lățimi 320/390 px. Capturi: `test-results/saga-catalog/`.
- `npm run test:saga:integration` și `npm run test:invoice-draft:integration`: regresiile existente au trecut, cu catalogul adăugat în fixture-uri.
- Typecheck global: aceleași diagnostice preexistente ca înaintea modificărilor; niciun diagnostic nou în comparația locală.

Nu au fost efectuate apeluri către firma SAGA reală în această etapă. Nu au fost publicate aplicația sau regulile și nu au fost schimbate datele din SAGA. Testarea pe telefon fizic și activarea în producție rămân separate.


## Asocierea clienților existenți — 7 noiembrie 2026

Este implementată local lista de referință CSV/XLSX, asocierea explicită în pagina clientului FOM și afișarea în ciorna facturii. Detalii de utilizare, API, reluare a importului și dovezi: [saga-clients.md](saga-clients.md). Lista rămâne separată de registrul `clienti`. Această etapă nu efectuează apeluri către SAGA; configurarea și publicarea rămân separate.

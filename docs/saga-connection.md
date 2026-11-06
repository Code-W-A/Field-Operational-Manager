# SAGA — conexiune și consultări

Implementare locală: **6 noiembrie 2026**. Etapa acoperă numai citirea unui articol și a stocului său din SAGA Web. Nu emite/importă facturi și nu modifică marfa sau ciornele din FOM.

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

**Activare:** publicați mai întâi regulile care exclud `sagaConnections` atât pentru documente, cât și pentru subcolecții din accesul direct SDK/REST al clienților. Verificați refuzul citirii/scrierii directe inclusiv pentru admin. Abia apoi setați `SAGA_READS_ENABLED=true` pe server și reporniți Next.js. Acest flag este o barieră de activare explicită, nu o verificare automată a regulilor publicate.

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

Verificare reală din 6 noiembrie 2026: în panoul SAGA au fost consultate articolul `WIFI4CHR3`, gestiunea `0005` (DEPOZIT 1), firma `34272913` și stocul de **2 BUC**, cu data raportului până la `06.11.2026`. Un apel local punctual la `GetStocArticol`, urmat de o cerere de diagnostic pentru mesajul erorii, a primit `HTTP 400` și mesajul `User neautorizat. Datele de logare nu sunt valide.` SAGA nu a returnat o cheie reînnoită. Nu există încă un stoc obținut prin API și nu se poate confirma concordanța cu panoul. Starea verificării este păstrată criptat local în `.env.saga-verification.local`, ignorat de Git; nu s-a scris în Firestore și citirile FOM rămân dezactivate. Este necesară verificarea cheii API curente pentru această firmă înaintea unei noi încercări.

Aplicația și regulile nu au fost publicate. Următoarele etape sunt asocierea nomenclatoarelor, seria/numerotarea, XML și import de probă într-o firmă de test, apoi dovada validării și a descărcării stocului.

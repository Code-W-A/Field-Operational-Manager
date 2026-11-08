# Planul 2 — etapa 4: curs EUR informativ

Implementare locală: **8 noiembrie 2026**. Sursa confirmată de utilizator este BNR direct, înlocuind cerința inițială Infovalutar. Nu se face conversie valutară: moneda facturii, prețurile, discountul, TVA-ul și totalurile rămân în RON.

## Comportament în editor

- La deschiderea unei ciorne fără referință EUR și după schimbarea datei emiterii se propune automat cursul. Propunerea nu salvează ciorna, nu consumă numere și, singură, nu produce avertismentul de închidere cu editări nesalvate.
- Secțiunea **Curs EUR informativ** afișează `1 EUR = … RON — referință informativă`, sursa BNR, data reală a publicării, data facturii pentru care a fost ales și momentul preluării.
- Salvarea ciornei păstrează propunerea disponibilă pentru data ei. Butonul „Păstrează cursul în ciornă” permite selectarea explicită înainte de salvare.
- Ciorna cu referință salvată o păstrează la redeschidere, fără recitire automată. „Actualizează cursul EUR” consultă serviciul/cache-ul și afișează o propunere separată; „Folosește cursul actualizat” o aplică local, iar salvarea o persistă.
- Schimbarea datei invalidează referința sau omiterea alese pentru data veche. Răspunsurile întârziate ale unei căutări pentru altă dată/alt cont nu suprascriu selecția curentă.
- La eroare se păstrează editările locale și, dacă există, referința salvată. Operatorul poate reîncerca sau alege „Continuă fără curs EUR”, urmat de confirmarea din interiorul panoului. Nu se folosește valoarea zero în locul unui curs indisponibil.
- Confirmarea omiterii este salvată cu UID-ul verificat și data serverului. Valorile de autor/timp trimise de browser nu sunt autoritative.
- Pregătirea XML cere referința salvată pentru data facturii sau omiterea confirmată. Ciornele incomplete pot fi salvate fără referință, dar pregătirea cere completarea acestei alegeri.
- Documentele înghețate afișează numai referința lor salvată. Documentele istorice fără referință sunt afișate ca atare; nu se completează retroactiv cu un curs actual.

## Sursa și cache-ul

Citirile sunt exclusiv pe server, fără cheie API, către adrese HTTPS prestabilite:

- `https://curs.bnr.ro/nbrfxrates10days.xml` — date recente;
- `https://curs.bnr.ro/files/xml/years/nbrfxratesYYYY.xml` — arhivă anuală.

Se alege cea mai recentă publicare **cu data <= data emiterii**. Pentru weekenduri/sărbători se afișează data reală a cursului anterior. La început de an, dacă arhiva nu oferă încă o publicare eligibilă, se consultă anul precedent. Datele viitoare și istoricul anterior anului 2005 sunt raportate ca indisponibile, fără inventarea unui curs. O eroare a sursei nu este interpretată ca absență a publicărilor.

XML-ul este validat: bază RON, monedă EUR, multiplicator absent sau 1, valoare zecimală pozitivă, date calendaristice valide, fără publicări viitoare sau valori contradictorii. Sunt acceptate namespace-uri XML. DTD/entity declarations, răspunsuri neinterpretabile, redirecționări și răspunsuri peste 2 MiB sunt respinse; timeout-ul implicit este 5 secunde per citire. Valoarea se păstrează ca șir zecimal, fără calcule monetare în virgulă mobilă.

Cache global de date publice BNR:

- `invoiceExchangeRateCache/{hash(sourceUrl)}`: rândurile validate și momentul verificării sursei; TTL 15 minute pentru date recente/anul curent și 24 de ore pentru anii încheiați.
- `invoiceExchangeRateQuotes/{hash(selection)}`: referință imuabilă pentru data solicitată, data publicării, valoare și sursă.

Citirile simultane către aceeași sursă sunt reunite în instanța serverului; crearea referinței este tranzacțională și idempotentă între instanțe. La aceeași valoare/datǎ/sursă se reutilizează referința existentă, fără rescrierea momentului primei preluări. O revalidare a cache-ului nu rescrie referințele deja salvate în ciorne/facturi. Un cache expirat nu este folosit silențios după o eroare de revalidare; referințele deja salvate rămân consultabile.

Butonul de actualizare respectă TTL-ul cache-ului; nu garantează o citire BNR nouă la fiecare click. Momentul preluării afișat aparține referinței păstrate. Serviciul BNR este independent de cheia, tokenul și lease-ul SAGA și nu pornește apeluri SAGA.

## API, modele și XML

`GET /api/lucrari/[id]/invoice-draft/eur-rate?date=YYYY-MM-DD`

Acces: admin/dispecer, prin identitate Firebase verificată și cont activ. Ruta verifică existența/eligibilitatea tichetului. Pentru un document înghețat returnează numai referința lui, fără citire externă. Erorile au cod separat și status HTTP, fără un curs numeric fals.

Răspuns valid:

```json
{
  "reference": {
    "status": "available",
    "quoteId": "identificatorul SHA-256 al referintei",
    "requestedDate": "2026-11-08",
    "value": "valoarea zecimala verificata",
    "rateDate": "data publicarii",
    "source": "BNR",
    "sourceUrl": "adresa feed-ului BNR",
    "fetchedAt": "momentul preluarii"
  },
  "readOnly": false
}
```

Ciorna și conținutul salvat acceptă opțional `eurReference`. La salvare, o referință `available` se rezolvă din registrul privat după `quoteId`, cu verificarea datei facturii. Un identificator inexistent sau o dată nepotrivită produce `409`; încercarea de modificare a valorii/provenienței unei referințe existente este respinsă. O selecție `omitted` reprezintă confirmarea explicită a operatorului și primește autor/data pe server. Referința nu intră în calculele de total.

Snapshot-ul documentului păstrează separat aceeași referință verificată, inclusă în amprenta previzualizării. Modificarea ciornei/referinței între preview și confirmare cere o previzualizare nouă. Rezervarea numărului și salvarea documentului rămân atomice; o eroare nu consumă număr.

Generatorul nou este **v4**. Referința se adaugă în `FacturaInformatiiSuplimentare`, lângă referința tichetului și notele existente:

- disponibil: `Curs EUR informativ BNR: 1 EUR = … RON; publicat la …; pentru factura din ….`;
- omis: `Curs EUR informativ: neînregistrat (omitere confirmată).`

Nu se introduce un tag fiscal nou și nu se schimbă `FacturaMoneda`. Verificarea artefactului din fluxul de transmitere validează referința și textul v4. Generatoarele/documentele istorice v1–v3 își păstrează octeții și rămân acceptate.

## Protecții și publicare

Cele două colecții noi sunt adăugate în `serverOnlyCollection` din `firestore.rules`, inclusiv protecția subcolecțiilor. Accesul Firestore direct este refuzat, inclusiv pentru admin. Nu sunt necesari indecși sau variabile de mediu noi.

**Regulile trebuie publicate înaintea utilizării cache-ului în cloud. Publicarea nu a fost executată.** Nu s-au configurat date reale, nu s-au trimis facturi SAGA și nu s-au schimbat statusurile contabile existente. PDF-ul și conversia valutară rămân în afara etapei.

## Fișiere și dovezi de verificare

Fișiere principale noi: `lib/invoicing/eur-rate.ts`, `eur-rate.server.ts`, `eur-rate-http.ts`, ruta `invoice-draft/eur-rate`, `components/invoicing/invoice-eur-rate.tsx`, `eur-rate.test.ts`, fixture-urile și `scripts/test-invoice-eur.ts`. Sunt extinse modelul/serviciul ciornei, editorul, generatorul/verificarea XML și regulile Firestore. Fixture-urile pregătirii XML din regresii confirmă explicit omiterea sau folosesc transport BNR simulat; snapshot-urile istorice nu au fost rescrise.

Executate local, cu refuzul traficului HTTP extern și fără credențiale reale:

- `npm run test:invoice-eur`: **8 teste trecute** — XML/namespace, precizie, selecția publicării, date, multiplicator, valori invalide, DTD, totaluri identice, XML v4/verificarea artefactului și compatibilitate istorică.
- `npm run test:invoice-eur:integration`: **trecut**, Auth/Firestore pe proiectul demo izolat `demo-fom-invoice-eur`; permisiuni, cache/concurență/TTL, referințe imuabile, arhive și schimbare de an, erori/timeout/redirecționare/dimensiune, date viitoare, referințe falsificate, conflict de dată/revizie, omiterea auditată, rollback și refuzul Firestore direct.
- Același script verifică browser → componente reale → API/Auth/Firestore: propunere fără salvare/dirty, valoare/sursă/date, păstrare la redeschidere, actualizare explicită, totaluri identice, invalidare după schimbarea datei, editări păstrate la eroare, omiterea confirmată, pregătire/redeschidere și 320/390 px. Captură locală: `/tmp/fom-invoice-eur-mobile.png`.
- Regresii unitare trecute: `test:invoice-draft` **10**, `test:invoice-xml` **8**, `test:invoice-commercial` **8**, `test:invoice-numbering` **4**, `test:invoice-saga` **9**. Împreună cu suita EUR: **47 de teste unitare**.
- Regresii API/emulator/browser trecute: `test:invoice-draft:integration`, `test:invoice-xml:integration`, `test:invoice-user-numbering:integration`, `test:invoice-numbering:integration`, `test:invoice-commercial:integration`, `test:invoice-saga:integration`, `test:saga:clients:integration`. Împreună cu suita EUR: **8 suite**.
- TypeScript global: **212 diagnostice înainte și după**, fără creșteri pe perechi fișier/cod TS și fără diagnostice noi în modulele modificate. Problemele globale preexistente nu au fost reparate în această etapă.

Nu a fost verificată o publicare Next.js, un telefon fizic sau o factură în firma SAGA reală. Datele BNR din teste sunt simulate; verificarea anterioară a disponibilității feed-urilor nu este o dovadă de funcționare în producție.

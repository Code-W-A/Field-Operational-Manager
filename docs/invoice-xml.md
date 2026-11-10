# XML numerotat, pregătit exclusiv în FOM

Actualizare **10 noiembrie 2026**: editorul principal folosește acum [finalizarea printr-o singură confirmare](invoice-finalization.md), cu autosalvare, rezumat și commit atomic număr + XML + transfer. Implementare/teste locale, fără publicare sau apeluri SAGA reale în această livrare. Pașii tehnici descriși mai jos se păstrează ca referință pentru serviciile reutilizate.

Implementare locală: **7 noiembrie 2026**. Nu există transmitere către SAGA, verificare online a stocului, import, emitere PDF sau modificare contabilă a tichetului în această etapă.

## Utilizare

1. Adminul configurează în **Setări → SAGA → Firma emitentă** datele fiscale confirmate și opțiunea TVA la încasare. CIF-ul normalizat trebuie să corespundă firmei conectate. Nu preluăm automat datele PDF-urilor sau conturi bancare demonstrative. Adresa structurată, denumirea și registrul comerțului sunt obligatorii; contactul și banca/IBAN-ul pot lipsi. Pentru România, județul este codul oficial, de exemplu `IF` sau `B`.
2. Adminul/dispecerul completează și salvează ciorna din tichet. Adresa beneficiarului are acum țară, județ și localitate opționale la salvarea ciornei, obligatorii la pregătirea XML (județul doar în România). Țara din asocierea confirmată poate fi completată printr-o acțiune explicită; adresa liberă nu este interpretată automat. Ciornele vechi nu necesită migrare.
3. **Pregătește XML** afișează rezumatul fiscal, liniile, calculele și numărul estimat. Previzualizarea și renunțarea nu rezervă numere. Modificările nesalvate trebuie salvate mai întâi.
4. **Confirmă pregătirea XML** rezervă numărul și îngheață documentul în aceeași tranzacție. Starea devine **Pregătit în FOM — netransmis**, **Compatibilitate SAGA neverificată**. Nu există deblocare/regenerare în această etapă.
5. **Descarcă XML** livrează fișierul privat prin API autorizat. Redeschiderea/reîncercarea păstrează același număr și aceiași octeți. După pregătire, ciorna poate fi doar consultată, inclusiv prin API.

## Verificări și calcule

Pregătirea verifică tichetul eligibil, revizia ciornei salvate, profilul emitentului, clientul FOM neambiguu și asocierea sa actuală, țara/CUI-ul confirmate, articolele active, reviziile, gestiunile permise și UM. Absența CUI este acceptată numai când sursele FOM/SAGA (inclusiv datele tichetului) nu cunosc un identificator fiscal și lipsa lui a fost confirmată în asociere. Importurile de clienți în curs blochează pregătirea.

Totalurile se recalculează pe server cu aritmetică zecimală `BigInt`. Discountul global și TVA-ul sunt repartizate pe linii prin metoda resturilor maxime; egalitățile se departajează prin ordinea liniilor. Totalurile liniilor coincid exact cu totalurile ciornei. Prețul net după discount are maximum 8 zecimale; dacă nu poate reproduce valoarea liniei la rotunjirea monetară, pregătirea este refuzată. TVA zero și discount 100% sunt acceptate. Sunt acceptate numai documente obișnuite în RON, cu TVA și discount globale.

Generatorul pur urmează [structura oficială SAGA](https://web.sagasoft.ro/DocumentatieAPI): `Facturi/Factura/Antet`, `Detalii/Continut/Linie`, codurile SAGA ale clientului/articolelor, identificatorii FOM stabili și gestiunile exclusiv pentru marfă. Folosește UTF-8, date `dd.MM.yyyy`, punct zecimal, valori monetare cu două zecimale, escaping XML și nume `F_<CIF>_<numar>_<dd_MM_yyyy>.xml` (caracterele nesigure din număr sunt înlocuite în numele fișierului).

Nu avem un XML de referință/import acceptat. Structura publicată nu este o schemă XSD, iar aceste alegeri de format și comportamentul contabil trebuie confirmate separat într-o firmă de test. Succesul testelor locale nu dovedește acceptarea în SAGA.

## Persistență, concurență și protecții

- `invoiceIssuerProfiles/{codFiscal}`: profil, revizie, autor, data salvării.
- `invoices/{workId}`: un document înghețat per tichet, număr, snapshot fiscal, versiune generator, autor, dată, SHA-256, starea locală și compatibilitatea neverificată.
- `invoiceArtifacts/{workId}`: XML privat, nume fișier și SHA-256. Fiecare dintre cele două documente este limitat conservator la 512 KiB înainte de commit.
- Alocatorul `reserveIn` participă la aceeași tranzacție Firestore cu recitirea surselor și salvarea celor două documente. Erorile generatorului sau limitei de dimensiune anulează și rezervarea numărului. Sursele schimbate produc `409`; editările locale rămân disponibile.
- Amprenta previzualizării include snapshot-ul și configurația seriei. O alocare pe alt tichet poate schimba estimarea; aceasta rămâne explicit nerezervată. Schimbarea administrativă a seriei/contorului invalidează previzualizarea.
- Confirmările concurente și cheile de operațiune diferite pentru același tichet returnează documentul existent. Numerele deja confirmate nu sunt reciclate. Modificarea ulterioară a surselor nu modifică XML-ul.
- Colecțiile sunt excluse din accesul Firestore direct. API-urile cer identitate Firebase verificată; adminul configurează profilul, adminul/dispecerul consultă/pregătește/descarcă. Descărcarea reverifică hash-ul și folosește `private, no-store`, fără URL public.
- Scrierile respectă bariera existentă `SAGA_READS_ENABLED`; denumirea variabilei este istorică. Publicarea regulilor și activarea mediului rămân separate.
- `numarFactura`, `statusFacturare`, `facturaDocument` și apartenența la raportul de nefacturate rămân neschimbate.

## API

| Metodă și rută | Funcție |
| --- | --- |
| `GET/PUT /api/integrations/saga/issuer` | Citire profil / salvare exclusiv admin, cu `expectedRevision` |
| `GET /api/lucrari/[id]/invoice-xml` | Document pregătit sau `null` |
| `POST /api/lucrari/[id]/invoice-xml/preview` | Previzualizare pentru `expectedRevision`, fără rezervare |
| `POST /api/lucrari/[id]/invoice-xml` | Confirmare cu revizie, `previewHash`, `operationId` |
| `GET /api/lucrari/[id]/invoice-xml/download` | Descărcare privată a XML-ului înghețat |

## Verificări locale

- `npm run test:invoice-xml`: calcule, preț nereprezentabil, XML valid și escaping, diacritice, date, zerouri, servicii, TVA zero/discount și compatibilitate cu ciornele vechi.
- `npm run test:invoice-xml:integration`: Auth/Firestore emulator, API-uri reale și componente reale în Chromium. Testele refuză HTTP extern și verifică permisiuni, concurență, rollback, limite, download, înghețare, refuz acces Firestore și păstrarea raportului de nefacturate. Verificarea browser include profil, previzualizare/renunțare/confirmare, salvare/redeschidere și 320/390px.
- Rezultat la 7 noiembrie 2026: **8/8 teste XML**, **10/10 ciornă**, **4/4 numerotare**, **8/8 SAGA/catalog**, **5/5 clienți**. Cele șase suite de integrare pentru XML, ciornă, numerotare, catalog, clienți și conector au trecut cu emulatoare și browser.
- Verificarea TypeScript globală păstrează erorile preexistente ale proiectului; comparația înainte/după nu adaugă diagnostice noi.
- Capturi: `test-results/invoice-xml/` (artefacte locale ignorate de Git).

Publicarea, utilizarea datelor reale, importul în SAGA și verificarea pe telefon fizic nu fac parte din aceste dovezi. Urmează integrarea controlată a importului într-o firmă de test și confirmarea efectului asupra validării/gestiunii.

## Finalizare și import — actualizare 8 noiembrie 2026

Peste documentul XML înghețat este implementată finalizarea cu import automat și verificarea separată a stocului, implicit dry-run. Generatorul nou folosește XMLBuilder, versiunea 2; documentele existente nu sunt regenerate. Workerul persistent, configurarea și dovezile sunt descrise în [invoice-saga-transfer.md](invoice-saga-transfer.md). Nu au fost efectuate importuri reale sau publicări; scăderea efectivă în SAGA rămâne neconfirmată practic.

## Generator comercial v3

Versiunea 3 adaugă TVA pe linii, agentul utilizatorului emitent și notele de antet/linie. Versiunile istorice nu sunt regenerate. Verificarea artefactelor pentru transmitere acceptă noile câmpuri. [Reguli comerciale și dovezi](invoice-commercial-rules.md).

## Generator v4 — curs EUR informativ

Documentele noi păstrează referința BNR sau omiterea confirmată și o includ în informațiile suplimentare. Pregătirea cere alegerea salvată, fără conversie RON. Versiunile istorice nu sunt regenerate. [Contracte și verificări](invoice-eur-reference.md).

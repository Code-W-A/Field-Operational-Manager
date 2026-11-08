# Numerotarea facturilor în FOM — etapa 1

Implementare locală: **7 noiembrie 2026**. Continuăm seria existentă, utilizată de acum înainte exclusiv de FOM. Inițializarea este manuală, din ultimul număr verificat în SAGA de admin; etapa nu citește și nu modifică SAGA. API-ul public SAGA nu documentează citirea ultimei facturi sau rezervarea următorului număr: [documentație](https://web.sagasoft.ro/DocumentatieAPI).

## Utilizare

1. Admin: **Setări → SAGA → Numerotare facturi**. Completează seria/prefixul și ultima valoare numerică verificată în SAGA, inclusiv zerourile inițiale. Nu există valori fiscale implicite. Exemplu ilustrativ: prefix `NRG`, ultima valoare `000125`, următoarea `NRG000126`.
2. Confirmă separat verificarea în SAGA și folosirea exclusivă a seriei în FOM. **Pregătește numerotarea** calculează o previzualizare pe server, fără scrieri. Confirmarea finală este afișată în aceeași secțiune și poate fi anulată fără efecte.
3. **Confirmă și salvează numerotarea** persistă configurația numai dacă previzualizarea este încă actuală. Orice schimbare concurentă a configurației sau contorului produce `409 NUMBERING_CONFLICT`, inclusiv o alocare apărută după previzualizare. Formularele nu consumă numere.
4. După prima alocare, prefixul și lungimea numerică minimă sunt fixe. Contorul nu poate fi micșorat/resetat. O corecție înainte necesită motiv, verificare, previzualizare și confirmare; istoricul reține valorile înainte/după și autorul. Înainte de prima alocare, adminul poate corecta inițializarea, tot cu motiv și confirmare.
5. În ciorna facturii, adminul/dispecerul vede **Număr estimat — nerezervat**, cu actualizare explicită. Valoarea se poate schimba dacă altă factură primește un număr. Deschiderea, editarea, minimizarea, salvarea și redeschiderea ciornei nu alocă numere. Tichetele neeligibile nu primesc o estimare nouă.

Partea numerică acceptă 1–18 cifre și folosește `BigInt`; prefixul are maximum 32 de caractere. Zerourile se păstrează, iar depășirea lungimii minime extinde numărul (`AA999 → AA1000`). Depășirea limitei de 18 cifre este refuzată, fără alte formule de numerotare. Nu există resetare la schimbarea anului.

## Persistență și servicii

Datele sunt separate de numerotarea tichetelor/rapoartelor:

- `invoiceNumbering/{codFiscal}`: seria activă, referința contorului, lungimea minimă, revizia configurației, ultima valoare verificată de admin, data verificării, autor și confirmarea exclusivității. Subcolecția `audit` păstrează configurația înainte/după corecții, iar `operations` leagă cheia operațiunii de tichet.
- `invoiceCounters/{sha256([codFiscal,prefix])}`: ultima valoare, numărul alocărilor reale și revizia contorului. Firma și seria sunt incluse în identitatea contorului.
- `invoiceNumberReservations/{sha256([codFiscal,workId])}`: o alocare per tichet și firmă, cu numărul complet, partea numerică, seria, revizia ciornei, operațiunea, autorul și momentul alocării.

Configurarea și alocarea folosesc tranzacții Firestore. Contorul avansează împreună cu înregistrarea alocării. Aceeași operațiune și același tichet returnează numărul existent; un alt identificator de operațiune pentru același tichet nu consumă alt număr. Refolosirea unei operațiuni pentru alt tichet este refuzată. Două tichete concurente primesc numere distincte. Nu există ștergere, eliberare sau reciclare automată a numerelor.

### API public

| Interfață | Acces și efect |
| --- | --- |
| `GET /api/integrations/saga/numbering` | Admin/dispecer; stare fără scrieri sau secrete. |
| `POST /api/integrations/saga/numbering/preview` | Admin; `{expectedRevision,prefix,lastVerifiedNumber,reason,exclusiveConfirmed,sagaVerified}`. Returnează previzualizarea și `confirmationHash`. |
| `PUT /api/integrations/saga/numbering` | Admin; aceleași câmpuri plus amprenta previzualizării. Serverul revalidează conținutul și starea curentă în tranzacție. |
| `GET /api/lucrari/{id}/invoice-draft/number` | Admin/dispecer; `{fiscalCode,number,reserved,reason}`. Poate afișa o alocare existentă, dar nu creează una. |

Identitatea Firebase și rolul/starea utilizatorului sunt reverificate. Conturile dezactivate sunt refuzate. Cele trei colecții și subcolecțiile lor sunt excluse din regulile Firestore generale pentru citire/scriere directă, inclusiv pentru admin.

**Alocatorul `reserve` este intern.** Nu are endpoint propriu și salvarea ciornei nu îl apelează. [Pregătirea XML](invoice-xml.md) folosește `reserveIn` în aceeași tranzacție cu salvarea snapshot-ului și XML-ului. Verifică tichetul, eligibilitatea de bază, revizia ciornei și unicitatea operațiunii/alocării. Comanda de pregătire XML execută verificările fiscale și ale asocierilor și gestionează înghețarea conținutului; alocatorul nu înlocuiește aceste verificări. Nu setează `numarFactura`, `statusFacturare` sau `facturaDocument` și nu emite factura.

## Activare și limite

Scrierile folosesc bariera existentă `SAGA_READS_ENABLED=true`, deși această etapă nu face citiri SAGA. Publicați mai întâi regulile care protejează `invoiceNumbering`, `invoiceCounters` și `invoiceNumberReservations`. Previzualizarea este disponibilă și cu scrierile dezactivate; confirmarea este blocată. Nu a fost schimbat niciun fișier de mediu și nu a fost activată numerotarea în producție.

Ultimul număr real, seria și exclusivitatea trebuie confirmate de operator; ele nu se deduc din numărul tichetului, raportului, facturilor PDF încărcate sau unui răspuns API presupus. În această livrare nu a fost configurată o serie reală, publicată aplicația ori publicate regulile.

## Verificări locale

```sh
npm run test:invoice-numbering
npm run test:invoice-numbering:integration
```

- 4 teste de domeniu: aritmetică exactă, zerouri/lungime, limite, confirmări, revizii, serie fixă și corecții monotone după alocare.
- API + Auth/Firestore pe proiectul izolat `demo-fom-invoice-numbering` (9394/8394): acces/cont dezactivat, preview fără scrieri, confirmări falsificate/stale, alocări interne concurente și repetate, aliasuri de operațiuni, izolare între firme/serii, revizie ciornă și facturi manuale, corecții, lipsa resetării anuale, refuz Firestore direct și păstrarea tichetelor.
- Browser cu componentele reale peste handler-ele HTTP/emulatoare: pregătire/anulare/confirmare, redeschiderea configurației, estimare dispecer, salvarea/redeschiderea/minimizarea ciornei fără consum de numere, serie readonly după o alocare internă de test, refuzul micșorării și corecție înainte cu motiv, lățimi 320/390 px. Capturi: `test-results/invoice-numbering/`.
- Regresii: ciornă, catalogul de produse, clienți și conector SAGA, cu suitele API/emulator/browser existente. Typecheck-ul global păstrează diagnosticele inițiale, fără diagnostice noi în comparația locală.

Testele folosesc exclusiv emulatoare și refuză HTTP extern. Nicio operațiune nu a fost transmisă către SAGA, nu s-a creat o conexiune SAGA și nu au fost folosite numere reale. Generarea XML-ului este implementată local separat ([detalii](invoice-xml.md)); urmează transmiterea într-o firmă de test; PDF-ul fiscal și confirmarea validării/descărcării mărfii rămân separate.

## Planul 2 — numerotare pe utilizator

Etapa 2 extinde alocatorul existent cu profiluri active și contoare per serie. Numerotarea generală rămâne funcțională până la activarea administrativă a noului mod. [Configurare, compatibilitate, corecții și teste](invoice-user-numbering.md).

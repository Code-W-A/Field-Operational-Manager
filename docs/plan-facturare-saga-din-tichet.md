# Plan: facturare SAGA din pagina de detalii a tichetului

Data analizei inițiale: **3 noiembrie 2026**. Actualizare implementare: **6 noiembrie 2026**.

**Stare curentă (7 noiembrie 2026):** ciorna facturii este implementată în pagina tichetului ([detalii](invoice-drafts.md)). Conectorul pentru citiri și interfața Setări → SAGA sunt implementate local; sunt adăugate catalogul reutilizabil de produse/gestiuni, asocierile în ciornă și consultarea stocului de către admin/dispecer ([detalii și verificări](saga-connection.md)). Activarea reală depinde de publicarea regulilor de protecție și configurarea mediului. Este implementată local și asocierea clienților existenți printr-o listă de referință CSV/XLSX, fără crearea clienților în registrul FOM și fără apeluri SAGA ([detalii](saga-clients.md)). Numerotarea este implementată local prin configurare manuală a ultimului număr verificat și contor tranzacțional FOM, cu estimare nerezervată în ciornă ([detalii](invoice-numbering.md)); alocatorul este conectat acum la pregătirea atomică a XML-ului în FOM, cu profil emitent, previzualizare, confirmare, ciornă înghețată și descărcare privată ([detalii](invoice-xml.md)). Documentul este netransmis și compatibilitatea SAGA este neverificată. Urmează importul de probă; validarea/descărcarea mărfii rămân de confirmat separat. Analiza și etapele de mai jos reprezintă planul general, nu dovada livrării integrale în producție.

**Actualizare 8 noiembrie 2026:** trimiterea automată după confirmarea finalizării și observarea separată a diferențelor de stoc sunt implementate local, implicit dry-run, peste XML-ul înghețat. Operațiunile sunt persistente, cu worker Firebase/Next.js, fără retry automat după începerea trimiterii. [Configurare, API, protecții și verificări](invoice-saga-transfer.md). Efectul efectiv asupra stocului și validării SAGA nu este încă demonstrat într-o firmă de test; publicarea/activarea sunt separate.

## 1. Rezultatul urmărit și decizia principală

Adminul/dispecerul pregătește factura direct în `/dashboard/lucrari/[id]`, într-o fereastră flotantă, nemodală și deplasabilă. Detaliile tichetului rămân vizibile și accesibile. La `Validează factura`, serverul verifică datele, calculează totalurile, alocă numărul documentului și transmite factura către SAGA. Factura devine definitivă numai după confirmarea operațiunilor necesare în SAGA, inclusiv efectul corect asupra mărfii.

**Limită esențială:** documentația publică SAGA Web confirmă importul automat al XML-ului, dar nu confirmă că acesta execută și validarea contabilă ori descărcarea gestiunii. Nu documentează nici un endpoint separat pentru aceste operațiuni. Automatizarea completă cerută depinde de demonstrarea acestui comportament într-o firmă de test sau de obținerea unei soluții oficiale suplimentare de la SAGA. Succesul importului nu va fi prezentat drept validare reușită. [Documentație API SAGA](https://web.sagasoft.ro/DocumentatieAPI).

Decizii propuse:

- SAGA este sursa autoritativă pentru stoc și contabilitate; FOM păstrează factura, legăturile și rezultatul sincronizării.
- FOM alocă numere într-o serie/plajă dedicată, convenită cu contabilitatea, deoarece API-ul public nu documentează rezervarea următorului număr din SAGA.
- Prima versiune acoperă o factură integrală pentru un tichet, în RON. Facturarea parțială, cumularea mai multor tichete și corecțiile automate sunt etape distincte.
- Salvarea ciornei nu transmite factura și nu scade stocul. Validarea este o comandă explicită, executată pe server.
- Închiderea ferestrei nu înseamnă validare. Validarea facturii nu arhivează și nu schimbă automat starea operațională a tichetului.

## 2. Baza documentară verificată

Au fost citite pagina API furnizată și paginile oficiale relevante din manualul SAGA C. Manualul desktop explică noțiunile contabile; comportamentul său nu este considerat automat contract al API-ului Web.

### 2.1. Contractul API disponibil

Toate căile de mai jos sunt relative la `https://web.sagasoft.ro/api/v20260225`.

| Operațiune documentată | Contract relevant pentru FOM |
| --- | --- |
| Autentificare | `Authorization: Bearer …`, `X-Saga-Cod-Fiscal`; cheia este generată de un administrator SAGA Web. |
| Actualizarea cheii | Persistarea valorii `X-Saga-Refresh-Token` din răspuns și folosirea ei la apelurile următoare. |
| `POST /Import` | `multipart/form-data`, câmpurile `file` și `importAutomat`; FOM va cere explicit `true`. Implicit este `false`. |
| Rezultat import | `200` succes integral; `207` rezultat parțial; `422` eșec total; `400` cerere invalidă. Se interpretează și corpul răspunsului, nu doar codul HTTP. |
| `GET /Situatii/GetStocArticol` | `codArticol` obligatoriu; `gestiune` opțională; `data` opțională în `dd.MM.yyyy`. Exemplul documentează răspuns JSON cu rezultat și date. |
| `GET /Situatii/GetSituatieStocuri` | `dataStart`, `dataEnd`, ambele obligatorii în `dd.MM.yyyy`; situația este returnată ca XML în exemple. |
| `GET /Situatii/GetArticol` | `codArticol`; articolul este returnat ca XML în exemple. |
| Alte funcții | Importuri de clienți și articole; interogări de sold și balanță, fără rol direct în emiterea din tichet. |

Sursa tabelului: [Documentație API SAGA Web — autentificare, import și situații](https://web.sagasoft.ro/DocumentatieAPI). Formatele efective ale răspunsurilor, capitalizarea proprietăților, precizia numerică și codurile de eroare vor fi fixate în contracte pornind de la răspunsuri de test; exemplele din limbaje diferite nu vor fi copiate ca implementare.

### 2.2. Date XML importante

Factura de ieșire folosește un fișier `F_<cod-fiscal>_<numar-factura>_<data-factura>.xml`. Codul fiscal al emitentului trebuie să fie în `FurnizorCIF`, pentru înregistrarea la ieșiri. Maparea va folosi următoarele câmpuri documentate:

| Date FOM | Câmpuri XML SAGA |
| --- | --- |
| Identitatea clientului | `ClientCIF`, datele fiscale, `Cod` pentru codul intern SAGA, `GUID_cod_client` pentru identitatea externă stabilă. |
| Identitatea facturii | `FacturaNumar`, `FacturaData`, `FacturaScadenta`, `FacturaID` sau `GUID_factura`. |
| Articolul și gestiunea | `CodArticolClient`, `GUID_cod_articol`, `Gestiune`, `UM`, `Cantitate`. |
| Valorile pe linie | `Pret`, `Valoare`, `ProcTVA`, `TVA`; `Cont` dacă este necesar pentru configurația contabilă. |
| Referința tichetului | `FacturaInformatiiSuplimentare`, cu numărul tichetului și referința FOM. |

Importurile separate de nomenclatoare au prefixele `CLI_` și `ART_` și câmpul extern `Guid_cod`. Identificatorii externi ajută asocierea; documentația nu garantează prin ei deduplicarea retrimiterii aceleiași facturi. Nu sunt chei de idempotență dovedite. [Structuri XML oficiale](https://web.sagasoft.ro/DocumentatieAPI).

Se obține un XML de referință generat de SAGA pentru configurația firmei. Formatul datelor din factura XML, seria inclusă în `FacturaNumar`, separatorii, codificarea și tratarea discounturilor se verifică separat; formatul datelor din endpointurile GET nu este extrapolat automat la XML.

### 2.3. Importul și validarea sunt pași diferiți până la proba contrară

Manualul SAGA C descrie importul intrărilor/ieșirilor ca nevalidat și un pas suplimentar de validare. Descrie și sincronizarea importului după criterii configurabile, ceea ce împiedică presupunerea că orice retrimitere este sigură. Aceste reguli desktop justifică verificarea Web, fără să dovedească singure comportamentul Web. [Manual oficial — Import date](https://manual.sagasoft.ro/sagac/topic-76-import-date.html).

În SAGA C, validarea blochează modificarea/ștergerea documentului și generează articolul contabil; gestiunile și tipurile de articole influențează operarea mărfii. În FOM, termenul „validată” trebuie să reflecte confirmarea reală a fluxului stabilit pentru firmă. [Manual oficial — Ieșiri în lei](https://manual.sagasoft.ro/sagac/topic-32-iesiri---lei.html).

API-ul public consultat nu documentează: listarea tuturor clienților/articolelor/gestiunilor, rezervarea numerelor, citirea unei facturi după ID pentru verificarea stării, validarea/devalidarea, scăderea directă a stocului, stornarea, descărcarea PDF-ului facturii sau transmiterea e-Facturii. Absența lor din documentație este o limită a planului, nu o afirmație că SAGA nu le poate oferi prin alt mecanism oficial. [API public consultat](https://web.sagasoft.ro/DocumentatieAPI).

## 3. Inventarul FOM din analiza inițială

Referințele locale sunt relative la acest document.

| Zonă existentă | Constatări și consecințe |
| --- | --- |
| [Pagina tichetului](../app/dashboard/lucrari/[id]/page.tsx) | Are editor de deviz și zona de documente; aici se adaugă pornirea facturării și fereastra flotantă. |
| [Editor deviz](../app/dashboard/lucrari/[id]/deviz-editor-dialog.tsx) | Folosește un `Dialog` și salvează `devizProducts`, versiuni, TVA, discount și identitatea clientului. Nu este un editor de facturi. |
| [Deviz automat](../lib/deviz/auto-deviz.ts) | Compune deplasare/constatare, manoperă și produse din raport. Rândurile generate nu identifică automat articole din gestiunea SAGA. |
| [Produse](../components/product-table-form.tsx), [tipuri canonice](../packages/fom-domain/works.ts) | Rândurile conțin nume, UM, cantitate, preț; nu au un contract SAGA de articol/gestiune. ID-ul vizual al unui rând de deviz nu este un ID de produs de catalog. |
| [Încărcare documente](../components/document-upload.tsx) | Uploadul facturii setează direct `statusFacturare = "Facturat"`; ștergerea documentului poate reveni la nefacturat. Acest comportament necesită restricții pentru o factură integrată și definitivă. |
| [Raport nefacturate](../lib/reports/uninvoiced.ts) | Un număr de factură, un document sau statusul `Facturat` scoate tichetul din raport. Numărul rezervat nu poate fi scris prematur în câmpul legacy `numarFactura`. |
| [Identitate client document](../lib/work-documents/document-client-snapshot.ts) | Există mecanism de înghețare a datelor clientului; factura trebuie să păstreze o identitate fiscală verificată, independentă de modificările ulterioare. |
| [Finalizare tichet](../lib/utils/work-completion.ts) | Există abstracția `hasTicketCompletionDocument`; eligibilitatea nu se reduce la `raportGenerat`, mai ales la instalări. |
| [Serviciu instalări](../lib/installations/service.ts), [câmpuri comerciale](../lib/installations/management.ts) | Au validări proprii. Pentru `Facturat`, serviciul cere acum un document cu URL. Noul serviciu de facturare trebuie coordonat cu acestea. |
| [Arhivare](../lib/utils/archive-validation.ts), [arhivare instalări](../lib/installations/archive.ts) | Verificările existente bazate pe document trebuie completate cu starea definitivă și eventualele operațiuni SAGA în așteptare. |
| [Autorizare](../lib/auth/require-role.ts), [reguli Firestore](../firestore.rules) | Există `requireVerifiedRole`. Regulile au și permisiuni generale care trebuie să excludă explicit noile date de facturare și câmpurile protejate. |

La analiza inițială nu exista un conector SAGA. Actualizarea din 6 noiembrie adaugă conectorul pentru citiri, descris mai sus. Contorul existent pentru rapoarte din `lib/firebase/firestore.ts` rămâne separat și nu va fi reutilizat pentru numerotarea facturilor.

Analiza inițială a identificat modificări locale preexistente, inclusiv în regulile Firestore și serviciile mobile, care trebuie păstrate. La redactarea inițială s-a adăugat exclusiv prezentul fișier; implementările ulterioare sunt descrise în actualizarea de la începutul documentului.

## 4. Experiența în pagina tichetului

### 4.1. Fereastră flotantă nemodală

- Buton `Facturează cu SAGA` în secțiunea de facturare, disponibil adminului/dispecerului eligibil.
- Se deschide în aceeași pagină, fără rută nouă, tab nou, `window.open`, fundal întunecat sau blocarea scrollului tichetului.
- Pe desktop, poziția inițială este laterală, în limita spațiului disponibil; antetul permite tragerea în orice parte a zonei vizibile. Corpul formularului rămâne selectabil și editabil normal.
- Pagina din spate rămâne utilizabilă: consultare raport/deviz, schimbare taburi, scroll și copiere de informații. Tracțiunea mouse-ului este capturată doar cât se trage de antet, fără un strat invizibil peste tichet.
- Antetul rămâne în ecran; poziția se ajustează la redimensionare, zoom și schimbarea orientării. Există `Repoziționează` și `Minimizează`, astfel încât informația acoperită să poată fi consultată imediat.
- La lățimi mici, formularul se poate așeza în fluxul paginii și minimiza; nu devine un modal care ascunde tot tichetul. Cerința de tragere se verifică separat pe desktop și tabletă.
- Tastatura poate muta/repoziționa fereastra prin controale accesibile; focusul poate circula între factură și tichet. `Escape` minimizează sau cere rezolvarea unei ciorne nesalvate, fără pierdere de date.
- O singură fereastră pentru tichet; redeschiderea reia ciorna. Salvarea și erorile sunt afișate în interior, fără dialoguri modale suplimentare.

Componentă propusă: `components/invoicing/invoice-floating-panel.tsx`. Dacă se reutilizează un primitiv de dialog, se configurează explicit nemodal și se verifică lipsa overlay-ului și a blocării focusului. Nu se înlocuiește global componenta `Dialog` și nu se schimbă editorul de deviz în această etapă.

### 4.2. Conținutul facturii

Antet: tichet, emitent, client fiscal asociat SAGA, serie, număr provizoriu sau alocat, data facturii, scadență, monedă. Beneficiarul fiscal este distinct de locația intervenției.

Linii: denumire, articol SAGA, tip `marfă`/`serviciu`, gestiune pentru marfă, UM, cantitate, preț fără TVA, cotă TVA, valoare și TVA. Codul articolului se afișează împreună cu denumirea, pentru a preveni selecții greșite.

Totaluri permanent vizibile: bază, discount, TVA pe cote și total de plată. Acțiuni: `Salvează ciornă`, `Validează factura`, `Minimizează`, `Închide`.

Sursa inițială este devizul salvat. Fără deviz, utilizatorul poate pregăti explicit liniile din raport; nu se facturează automat oferta și nu se înlocuiesc ulterior liniile editate cu un deviz recalculat. Schimbarea sursei este explicită și reface verificarea asocierilor.

## 5. Asocierea clienților și articolelor

### 5.1. Clienți FOM–SAGA

**Actualizare 7 noiembrie 2026:** lista locală de referință, asocierile explicite și afișarea în ciornă sunt implementate; [utilizare, contracte și verificări](saga-clients.md). Pregătirea XML este implementată exclusiv în FOM ([detalii](invoice-xml.md)); importurile contabile de mai jos rămân etape ulterioare.

1. Se identifică sigur clientul FOM după `clientId`; tichetul cu asociere ambiguă trebuie corectat înainte de validare.
2. Pentru clienții existenți în SAGA, se pregătește un nomenclator dintr-un export acceptat de contabilitate sau printr-un mecanism oficial confirmat ulterior. API-ul public nu oferă acum o listare documentată a clienților.
3. FOM propune asocierea pe CUI/CIF normalizat și țară. Prefixul fiscal și statutul TVA se păstrează separat; nu se elimină informația fiscală din document. Denumirea este indiciu, nu criteriu unic.
4. Un CUI care produce mai multe rezultate intră în conflict și necesită alegerea explicită a codului SAGA. Pentru persoane fizice sau lipsă identificator fiscal se folosește asociere explicită, fără potrivire automată doar după nume/telefon și fără colectarea unor identificatori inutili.
5. Se păstrează legătura `emitentCif + fomClientId -> sagaClientCode`, cu autorul și momentul verificării. Mai multe locații ale aceleiași firme pot folosi același client fiscal.
6. În factura XML se folosesc codul SAGA verificat și `GUID_cod_client` stabil. La importul separat de clienți, echivalentul extern este `Guid_cod`. Conflictele între cod și identitatea fiscală blochează trimiterea.
7. Adăugarea unui client nou în SAGA este o acțiune separată, explicită; se verifică întâi regulile reale de import, pentru a nu dubla un client existent. Datele din SAGA nu suprascriu automat registrul FOM.

### 5.2. Articole și gestiuni

- Se importă/asociază nomenclatorul existent înainte de prima factură cu marfă. Se păstrează codurile SAGA ca șiruri, inclusiv zerourile inițiale.
- O linie primește un `fomProductId` stabil din catalog sau o asociere explicită; ID-urile aleatoare din editor nu devin `GUID_cod_articol`.
- Legătura păstrează firma, articolul, UM, tipul și gestiunile permise. Identitatea produsului și gestiunea de ieșire sunt lucruri distincte.
- Manopera și deplasarea sunt servicii. Nu produc ieșire de marfă; clasificarea nu se deduce exclusiv din textul denumirii.
- Pentru marfă sunt obligatorii articolul SAGA, gestiunea explicită și UM compatibilă. Conversiile de UM trebuie configurate și testate; altfel sunt blocate.
- Denumirile asemănătoare nu sunt suficiente pentru asociere. O marfă fără asociere nu este trimisă drept serviciu sau articol „Nedefinit” pentru a ocoli validarea.
- Dacă marfa a fost deja descărcată prin aviz/bon de consum, se oprește fluxul simplu și se stabilește documentul corect. Nu se descarcă din nou aceeași cantitate la facturare. Asocierea avizelor nu este acoperită de un endpoint public confirmat.

## 6. Validare, calcule și efectul asupra stocului

### 6.1. Reguli înainte de trimitere

Serverul verifică identitatea și rolul, tichetul și clientul curent, preluarea de către dispecer, documentul de finalizare aplicabil tipului de tichet și lipsa anulării/arhivării. Pentru garanții, contracte și `Nu se facturează` se respectă decizia comercială existentă; nu se emit automat facturi pentru toate materialele din raport.

Se verifică: versiunea ciornei, sursa devizului, datele fiscale necesare, asocierea clientului, liniile complete, cantități finite și pozitive, prețuri/cote permise, gestiuni și stoc disponibil. O schimbare relevantă în tichet, client sau ciornă invalidează verificarea anterioară.

### 6.2. Totalul final este calculat pe server

Politică propusă, de confirmat pe exemple reale SAGA:

```text
valoareBrutaLinie = cantitate × pretUnitarFaraTVA
reducereLinie = partea alocată din discount
bazaLinie = rotunjireMonetara(valoareBrutaLinie − reducereLinie)
tvaLinie = rotunjireMonetara(bazaLinie × cotaTVA / 100)
totalBaza = suma(bazaLinie)
totalTVA = suma(tvaLinie)
totalFactura = totalBaza + totalTVA
```

Se folosește aritmetică zecimală controlată, cu precizia cantității/prețului separată de rotunjirea sumelor. Discountul general se repartizează pe liniile și cotele eligibile; diferența de rotunjire se distribuie determinist. Nu se reduce cantitatea fizică pentru aplicarea unui discount. TVA-ul devizului este sugestie, nu înlocuiește verificarea cotelor de pe factura finală.

Datele facturii se tratează ca date calendaristice în `Europe/Bucharest`; momentele operațiunilor sunt timestampuri de server. Emiterea retroactivă/perioadele închise se validează conform configurației SAGA confirmate în etapa de test.

### 6.3. Secvența comenzii `Validează factura`

1. Verificare server a tuturor regulilor și recalculare; UI prezintă în aceeași fereastră orice diferență ce trebuie acceptată înainte de trimitere.
2. Verificare proaspătă a stocului pe articol și gestiune. Liniile repetate se însumează pe aceeași cheie înainte de comparație. Eroarea de citire sau răspunsul neinterpretabil blochează operațiunea; nu devin stoc zero sau stoc disponibil.
3. Tranzacție FOM: unicitatea facturii active pentru tichet, rezervarea numărului, înghețarea conținutului și înregistrarea unei comenzi durabile de trimitere. Cheia comenzii se păstrează pentru repetarea cererii din browser.
4. Procesare pe server: generare XML din conținutul înghețat și `POST /Import`, o factură per fișier la început. Se păstrează hashul și rezultatul pentru diagnostic.
5. Persistarea rezultatului importului și a eventualei chei reînnoite. `200` plus rezultat pozitiv confirmă importul, nu dovedește singur validarea/descărcarea.
6. Executarea sau confirmarea pasului oficial de validare identificat în etapa de fezabilitate. Pentru marfă se confirmă efectul corect în gestiune; pentru servicii stocul este „nu se aplică”.
7. Factura trece în starea definitivă doar când dovezile cerute sunt complete. Atunci se actualizează sumarul tichetului și se închide editorul; pagina rămâne pe același tichet și afișează factura și rezultatul.

Citirea stocului înainte de import nu rezervă marfa în SAGA. Alte vânzări pot interveni; serializarea comenzilor FOM nu controlează operatorii SAGA. Controlul final trebuie asigurat de fluxul SAGA testat, cu tratarea stocului insuficient și a erorilor parțiale.

Un simplu calcul `stocDupă = stocÎnainte − cantitate` în Firebase nu descarcă marfa din SAGA. FOM nu va scrie direct în tabelele interne ale bazei SAGA și nu va ține un al doilea stoc contabil independent. Poate păstra o copie de consultare, cu data actualizării.

Diferența dintre două citiri de stoc este verificare auxiliară, nu dovadă unică a descărcării unei anumite facturi: alte operațiuni pot modifica același articol. Reconcilierea trebuie să lege documentul SAGA de cantitățile și gestiunile facturii.

### 6.4. Dacă SAGA nu permite validarea prin API

Se poate livra doar un flux intermediar explicit: FOM importă factura, apoi aceasta rămâne `Importată — așteaptă validare în SAGA`. Editorul poate fi minimizat/închis de utilizator, dar nu afișează succes definitiv și nu pretinde descărcarea mărfii. Confirmarea manuală, dacă este acceptată comercial, este făcută de un rol autorizat, cu document/referință și audit.

**Acest flux intermediar nu îndeplinește cerința de automatizare completă din pagina tichetului.** Pentru rezultatul integral este necesar un mecanism oficial SAGA care validează și permite confirmarea efectului. Nu se inventează un endpoint și nu se presupune că `importAutomat=true` este echivalentul butonului `Validez`.

## 7. Numerotare automată și prevenirea duplicatelor

- Se definește o serie/plajă dedicată FOM și un prim număr verificat cu contabilitatea; SAGA și ceilalți operatori nu emit independent în aceeași plajă.
- Alocarea este server-side și tranzacțională, cu cheie pe emitent, serie și perioada convenită. Configurarea resetării anuale este explicită, nu implicită.
- La deschiderea editorului apare `Număr alocat la validare`; simpla consultare sau salvare a ciornei nu consumă numere.
- Prima comandă de validare care trece verificările rezervă un singur număr. Aceeași factură păstrează numărul la retry, refresh sau redeschidere.
- Numerele rezervate cu rezultat incert nu se reciclează. Rezervările abandonate se justifică în audit, conform procedurii stabilite cu contabilitatea.
- O constrângere tranzacțională previne două facturi active pentru același tichet și două utilizări ale aceluiași număr. Nu se folosește `max + 1` citit din browser și nici fallback cu timestamp.
- Seria și numărul se compun în `FacturaNumar` conform formatului acceptat în test. Nu se suprascrie numerotarea tichetelor/rapoartelor.

SAGA C documentează configurarea plajelor și seriilor în ecranele sale; acest lucru nu dovedește existența unui serviciu API de rezervare pentru FOM. [Manual oficial — Numere și serii](https://manual.sagasoft.ro/sagac/topic-85-numere-si-serii.html).

## 8. Model de date și contracte propuse

Denumirile următoare sunt propuneri, nu colecții/endpointuri deja implementate.

### 8.1. Date persistente

| Zonă | Conținut și responsabilitate |
| --- | --- |
| `invoices/{invoiceId}` | Tichet, emitent, client, sursă deviz/versiune, linii tipizate, totaluri, număr rezervat, revizie, stări, identitate fiscală înghețată și referințe SAGA. |
| `invoiceCounters/{scope}` | Seria/plaja, următorul număr și limitele configurate; acces exclusiv prin server. |
| `sagaClientLinks`, `sagaArticleLinks` | Asocieri verificate, separate pe emitent, cu autor, moment și sursă. |
| `invoiceCommands/{commandId}` | Comenzi durabile, cheie de deduplicare, payload înghețat, încercări, lease, rezultat și stare de reconciliere. |
| `invoiceEvents/{eventId}` | Istoric append-only: cine, când, versiune, tranziție, referința dovezii și motivul corecțiilor. |
| Stocare privată de fișiere | XML transmis, raport SAGA și PDF aferent, fiecare cu hash, tip și acces autorizat. |
| Secret server SAGA | Cheia inițială și cea reînnoită, stocate securizat, fără acces browser/client. |
| Sumar pe `lucrari/{id}` | `invoiceId` și un sumar de stare; câmpurile legacy definitive sunt completate doar la finalizare. |

Factura are stări distincte pentru a nu confunda efectele:

- Ciclu document: `draft`, `locked`, `finalized`, `needs_review`, `cancelled_before_send`.
- Import: `not_sent`, `queued`, `sending`, `imported`, `partial`, `failed`, `unknown`.
- Validare SAGA: `not_confirmed`, `confirmed`, `manual_required`.
- Stoc: `not_applicable`, `pending`, `confirmed`, `needs_review`.
- PDF: `pending`, `ready`, `failed`, independent de succesul importului.

Regula finalizării: import integral confirmat + validare confirmată + stoc confirmat sau neaplicabil. După trimitere, conținutul nu este editabil liber; corecțiile trec prin reconciliere/procedura contabilă. O factură definitivă nu devine ciornă prin ștergerea PDF-ului.

### 8.2. API intern FOM

| Rută propusă | Responsabilitate |
| --- | --- |
| `GET/POST /api/lucrari/[id]/invoice` | Citire autorizată și creare/reluare ciornă; nu trimite în SAGA. |
| `PATCH /api/invoices/[invoiceId]` | Salvare cu `expectedRevision`; conflictul dintre doi operatori produce `409`, nu suprascriere tăcută. |
| `POST /api/invoices/[invoiceId]/validate` | Comandă cu `expectedRevision` și cheie de idempotență; verifică, rezervă și pune în procesare. |
| `GET /api/invoices/[invoiceId]/status` | Stare recuperabilă după refresh, fără o nouă trimitere. |
| `POST /api/invoices/[invoiceId]/reconcile` | Rezolvarea controlată a unui rezultat incert/parțial; drepturi și dovezi explicite. |
| API-uri de asocieri și consultare stoc | Toate trec prin backend; căutarea clientului folosește nomenclatorul local verificat, nu un endpoint SAGA presupus. |

Se reutilizează `requireVerifiedRole(["admin", "dispecer"])` și identitatea Firebase verificată. Configurarea cheilor și a seriilor aparține adminului; consultarea clientului primește doar datele/documentul care îi sunt permise. Backendul recitește datele autoritative și nu acceptă totaluri, rol sau confirmări contabile declarate arbitrar de browser.

## 9. Execuție durabilă, erori și reconciliere

Cererea HTTP către SAGA nu se execută în interiorul unei tranzacții Firestore. Factura și comanda se înregistrează atomic; un worker durabil, cu lease și recuperare după oprire, face apelul extern. Răspunsul UI poate fi `202`, iar progresul este citit din starea persistentă. Procesarea nu depinde de tabul browserului sau de o promisiune lăsată în fundal după răspunsul serverului.

Toate apelurile care folosesc aceeași cheie SAGA, inclusiv citirile de stoc, trec printr-o coordonare comună pe firmă/credencial. Astfel se previn cursele de actualizare a tokenului. Persistarea unui token nou e prioritară; dacă rezultatul/cheia nu pot fi salvate sigur, integrarea intră în reconciliere în loc să continue orbește cu tokenul vechi.

| Situație | Comportament obligatoriu |
| --- | --- |
| `200` și corp pozitiv | Import confirmat; verificarea validării și stocului continuă separat. |
| `200` și corp negativ/neinterpretabil | Nu se declară succes; rezultatul este analizat și păstrat. |
| `207` | Se păstrează raportul și se investighează ce s-a importat; fără finalizare sau retrimitere integrală automată. |
| `422` / `400` | Eroare vizibilă pe document; corectarea și eventuala nouă încercare respectă rezultatul real deja înregistrat. |
| Timeout, conexiune întreruptă, `5xx`, worker oprit după apel | Rezultat potențial incert: SAGA ar fi putut importa. Nu se retrimite automat factura până la reconciliere. |
| Cheie invalidă/expirată | Se oprește trimiterea; configurarea este reparată de admin. |
| Refresh/dublu click/reîncercare browser | Se returnează aceeași comandă și același număr. |
| Import reușit, dar salvare FOM eșuată | Comanda rămâne recuperabilă; se reconciliază, fără al doilea import sau a doua descărcare. |
| PDF eșuat după import | Se regenerează/atașează PDF-ul aceleiași facturi, fără reemitere în SAGA. |

API-ul nu documentează o cheie de idempotență ori o căutare de factură suficientă pentru a garanta efect unic extern. Deduplicarea locală elimină duplicatele provenite din FOM înainte de apel; nu poate garanta singură „exact o dată” în SAGA după un timeout. Până la un mecanism oficial verificat, cazurile incerte necesită verificare autorizată în SAGA.

Stornarea/devalidarea și returul de marfă necesită procedură contabilă și mecanism SAGA separat. În prima versiune se păstrează referința și se blochează ștergerea/editarea distructivă; nu se simulează corecția prin incrementarea locală a stocului.

## 10. Compatibilitate cu aplicația existentă

- Documentele încărcate manual rămân funcționale. Existența unei facturi manuale sau a unui număr fiscal blochează emiterea automată până la clarificare; nu se trimite încă o factură pentru același tichet.
- Numărul rezervat este păstrat în factura nouă, nu în `lucrare.numarFactura`. `statusFacturare`, `numarFactura` și `facturaDocument` nu sunt folosite pentru a sugera emiterea finală înainte de confirmări.
- Pentru facturile SAGA, raportul de nefacturate și dashboardul folosesc un rezolvitor comun al stării. Operațiunile în așteptare rămân vizibile; numărul alocat și mesajul de sincronizare nu le ascund.
- Se auditează notificările care verifică doar `facturaDocument`, listele, exporturile și pagina arhivată. Un PDF singur nu ține loc de confirmare a integrării.
- Pentru instalări, se coordonează serviciul comercial existent, lista câmpurilor permise și condiția actuală de document PDF la `Facturat`. Nu se ocolește serviciul cu un update arbitrar din browser.
- Arhivarea se blochează cât timp emiterea este incertă/parțială sau lipsește validarea cerută. Facturarea nu modifică fișele semnate, echipamentele sau istoricul tehnic.
- Dacă se adaugă tipuri comune, sursa rămâne `packages/fom-domain`; sincronizarea în Expo se face prin scriptul existent. Nu se adaugă editor de facturi în aplicația mobilă în această etapă.
- Noile colecții, subcolecții, fișiere private și câmpuri-sumar necesită reguli de acces explicite. Se închid și căile generale existente care altfel ar permite citirea/scrierea lor directă; numai ascunderea butonului nu protejează emiterea.

## 11. PDF-ul facturii

API-ul citit nu documentează returnarea PDF-ului. Se alege explicit una dintre variante înainte de integrarea finală:

1. Generare PDF în FOM din exact același conținut fiscal înghețat și aceleași totaluri trimise către SAGA; formatul este verificat cu contabilitatea.
2. Atașare a PDF-ului emis din SAGA printr-un mecanism oficial confirmat sau manual, păstrând identitatea facturii deja importate.

Recomandare pentru implementare: generator FOM separat de PDF-ul devizului, cu emitentul, clientul fiscal, seria/numărul, liniile și totalurile. Un preview de ciornă se etichetează clar și nu populează `facturaDocument`. PDF-ul fiscal și legătura legacy se publică după confirmarea facturii; o eroare de PDF nu anulează documentul deja înregistrat în SAGA.

Importul XML SAGA nu este echivalent cu transmiterea în SPV. Câmpurile de index SPV din XML nu constituie un serviciu documentat de transmitere e-Factura. Acest flux rămâne separat de scopul prezentului plan. [Documentație API SAGA](https://web.sagasoft.ro/DocumentatieAPI).

## 12. Etapele implementării viitoare

### Etapa 0 — probă de fezabilitate SAGA, înaintea promisiunii de automatizare completă

- Identificarea produsului folosit efectiv: SAGA Web, firma, modulul de stocuri, evidența cantitativ-valorică, gestiunile și legătura cu desktopul, dacă există.
- Mediu/firmă de test, backup și set de date delimitat. O cheie reală sau un import contabil nu este necesar pentru redactarea acestui plan și nu a fost folosit acum.
- XML de referință pentru un client existent și o factură cu un articol de marfă plus un serviciu.
- Demonstrarea separată: import, stare de validare, notă contabilă, gestiunea exactă și efectul asupra stocului; verificare că serviciul nu produce mișcare de marfă.
- Confirmarea mecanismului oficial pentru validare, verificarea documentului, comportamentul duplicatelor și al tokenului, numerotare și PDF.
- Stabilirea exportului inițial de clienți/articole/gestiuni și a regulilor de asociere.

**Livrabil:** matrice de capabilități cu dovezi și decizie: automatizare completă posibilă / import cu validare manuală / blocaj de API. Dacă lipsește validarea automată, aceasta rămâne condiție de rezolvat, nu funcție declarată terminată.

### Etapa 1 — contracte, securitate și date

Definirea schemelor și tranzițiilor, asocierilor, calculelor, seriei, comenzilor durabile și auditului; reguli Firestore/Storage și autorizare server. Stabilirea invariantelor pentru instalări și facturile legacy. Teste pe emulator, fără apeluri contabile reale.

### Etapa 2 — editorul flotant în pagina tichetului

Ciornă persistentă, sursă deviz, tabel fiscal, asocieri, totaluri și controale de mișcare/minimizare. Verificare în browser pe desktop/tabletă/ecran îngust, inclusiv accesarea detaliilor tichetului din spate. În această etapă trimiterea este simulată și etichetată ca atare.

### Etapa 3 — conector și procesare

Adapter SAGA pe server, XML, numerotare atomică, worker, token rotativ, interpretarea rapoartelor, deduplicare și reconciliere. Integrarea validării și stocului folosește exclusiv mecanismul demonstrat la etapa 0. Contractele sunt verificate mai întâi cu răspunsuri salvate și date anonimizate.

### Etapa 4 — închiderea fluxului FOM

Confirmări definitive, PDF, sumar pe tichet, nefacturate, dashboard, arhivare, instalări și prevenirea ștergerii facturii contabile prin ștergerea fișierului. Tratarea căderilor după succes extern și a conflictelor între operatori.

### Etapa 5 — pilot și activare controlată

Pilot într-un mediu autorizat, cu dovada documentului în SAGA, numerotării, totalurilor și stocului. Activare inițială pentru un emitent și utilizatori desemnați. Dezactivarea integrării oprește comenzile noi, păstrând documentele și coada de reconciliere; nu șterge facturi din SAGA.

La redactarea inițială s-a realizat numai planul. Implementările ulterioare autorizate și verificările lor sunt documentate separat în `invoice-drafts.md`, `saga-connection.md`, `saga-clients.md`, `invoice-numbering.md` și `invoice-xml.md`; importurile contabile reale și publicarea în producție nu au fost efectuate în aceste etape.

## 13. Verificări și criterii de acceptare

| Scenariu | Dovadă necesară |
| --- | --- |
| Fereastră flotantă | URL neschimbat; deplasare în stânga/dreapta/sus/jos; fără overlay, blocarea paginii sau pierderea ciornei. |
| Consultare tichet | Raportul, produsele și detaliile pot fi citite, selectate și derulate în timp ce factura este deschisă. |
| Resize, zoom, tabletă | Antet și butoane accesibile, poziție recuperabilă, minimizare și utilizare din tastatură. |
| Ciornă | Salvare/redeschidere/refresh păstrează datele; nu există import sau mișcare de stoc. |
| Client | Asociere fiscală verificată, conflict de CUI, client fără CIF și mai multe locații testate distinct. |
| Articole | Marfă vs serviciu, cod cu zerouri inițiale, UM incompatibilă, gestiune greșită și produs neasociat. |
| Totaluri | Discount, cote multiple, cantități zecimale și rotunjiri comparate cu exemple SAGA acceptate. |
| Numere | Două validări simultane pentru tichete diferite au numere diferite; pentru același tichet există o singură factură activă. |
| Dublu click/retry | Aceeași comandă, același XML și același număr; nu există al doilea import. |
| Eroare parțială/incertă | `207`, timeout și oprire worker după import păstrează dovada și blochează retrimiterea necontrolată. |
| Token | Cheia reînnoită este folosită la apelul următor; citirile și trimiterile concurente nu o suprascriu cu o versiune veche. |
| Stoc insuficient/concurență | Nu apare succes fals; sunt testate liniile repetate, alte mișcări SAGA și marfa deja descărcată prin alt document. |
| Validare reală | Există documentul corect în SAGA, dovada validării și mișcarea de marfă atribuită documentului; `HTTP 200` singur nu trece testul. |
| Definitivare | Factura se blochează și editorul se închide doar după confirmările cerute; tichetul rămâne deschis în aceeași pagină. |
| PDF și arhivare | Eșecul PDF nu reemite factura; regenerarea păstrează identitatea; stările în așteptare nu dispar din controalele operaționale. |
| Instalare/intervenție/revizie | Finalizarea și preluarea sunt evaluate după contractul fiecărui tip; documentele tehnice și garanțiile sunt păstrate. |
| Acces neautorizat | Clientul/tehnicianul/neautentificatul nu pot emite, modifica contoare, confirma contabilitatea sau citi cheia/rapoarte private, inclusiv prin acces Firestore direct. |

Verificarea viitoare se raportează separat: teste de domeniu, emulator, browser, firmă SAGA de test, pilot și producție. Pentru prezentul document au fost realizate numai cercetarea documentației publice, inspecția codului și verificarea fișierului Markdown; nu există dovadă de integrare funcțională sau de descărcare reală a stocului.

## Actualizare locală — Planul 2, etapa 3

Editorul și regulile comerciale sunt implementate cu activare explicită, migrarea confirmată a ciornelor, surse API protejate, TVA pe linii, scadență și note. Documentele istorice și numerotarea lor sunt păstrate. [Implementare, contracte și verificări](invoice-commercial-rules.md). Nu s-au configurat date reale și nu s-a publicat nimic.

## Actualizare locală — Planul 2, etapa 4

Cursul EUR informativ din BNR este implementat, conform sursei confirmate ulterior. Se păstrează în ciornă și XML v4 fără modificarea totalurilor RON. [Implementare și teste](invoice-eur-reference.md). Publicarea regulilor pentru cache și folosirea în cloud rămân separate.

# Rezultate — etapa 3: cataloage și asocieri FOM–SAGA

Verificare în producție: **9 noiembrie 2026, aproximativ 20:18–20:31, Europe/Bucharest**.

## Verdict

**Scenariul de asociere a trecut pentru un client, un produs și o gestiune reale.** Legăturile au fost salvate în FOM, recitite după redeschidere și verificate și prin citiri autorizate, cu mascarea câmpurilor, din Firestore.

**Au fost găsite și probleme:** exportul XLSX real este respins de FOM, în timp ce exportul CSV funcționează; secțiunile cataloagelor de referință/profilurilor afișează mesaje de indisponibilitate. Aceste rezultate împiedică declararea întregii zone de import/referințe ca fiind verificată integral. Nu am modificat sau publicat cod pentru a ascunde/remedia aceste probleme în timpul testului.

## Firma și datele folosite

- FOM: `https://fom-nrg.vercel.app`.
- SAGA Web: sesiunea existentă pe `https://web0.sagasoft.ro`.
- Firma conectată: **NRG ACCESS SYSTEMS S.R.L., CUI 34272913**.
- Operator FOM: sesiunea existentă **Andrei**.
- Nu au fost folosite date fictive pentru modificarea firmei SAGA.

## 1. Clientul FOM–SAGA

| Câmp | FOM | SAGA |
| --- | --- | --- |
| Denumire | BK TECHNIK S.R.L. | BK TECHNIK SRL |
| CUI/CIF | RO13901263 | RO13901263 |
| Identificator fiscal normalizat | 13901263 | 13901263 |
| Țară fiscală | RO, confirmată explicit în asociere | RO, din lista SAGA și export |
| Identificator | `qDSsmQYmbbUW5xPYOeoW` | Cod `00236` |

Pași executați:

1. Am identificat clientul existent în FOM. Înaintea testului era afișat „Clientul FOM nu este asociat cu SAGA”.
2. În nomenclatorul Clienți SAGA am căutat CUI-ul `13901263`. Rezultatul era `00236 — BK TECHNIK SRL — RO13901263 — RO`.
3. Am descărcat exportul filtrat XLSX, apoi CSV. Acestea sunt exporturi din SAGA, nu importuri în SAGA.
4. În FOM am importat CSV-ul, mapând `cod`, `denumire`, `cod_fiscal`, `tara`. Previzualizarea a avut **un singur rând** și a păstrat `00236`.
5. Importul în lista separată de referință FOM s-a finalizat **1/1**.
6. Din pagina clientului am confirmat țara `RO`, am folosit **Propune după CUI**, am selectat singurul rezultat și am apăsat **Confirmă asocierea în FOM**.
7. FOM a afișat asocierea confirmată la **20:27:39**, cu sursa CSV. Recitirea asocierii a păstrat codul, CUI-ul și sursa.

Persistență verificată:

- Legătura: `sagaCatalogs/34272913/clientLinks/qDSsmQYmbbUW5xPYOeoW`, activă, revizia 1.
- Intrarea SAGA: `sagaCatalogs/34272913/clients/94590fb1e0a8b9fcb83e2d5d270a7d4c937f5c269d762c55dee142d74f22f520`.
- În documentul de referință, codul este `stringValue: "00236"`, iar CUI-ul este `stringValue: "RO13901263"`.
- Legătura păstrează `fomTaxId: "13901263"` și `country: "RO"`.

Nu am creat un client nou în registrul FOM și nu am editat denumirea, CUI-ul, adresa, locațiile sau contractele clientului existent. Asocierea este separată, conform fluxului implementat. Nu am efectuat alte asocieri de clienți.

## 2. Gestiunea și produsul

În nomenclatorul Gestiuni din SAGA am confirmat **`0005 — DEPOZIT 1`**, de tip cantitativ-valoric. Am adăugat această referință în catalogul FOM.

Produsul asociat:

- Cod articol SAGA: **`WIFI4CHR3`**.
- Denumire: **RELEU INTELIGENT WIFI SONOFF 4CH R3 CU 4 CANALE**.
- UM verificată prin SAGA: **BUC**.
- Clasificare FOM: **marfă**.
- Gestiune permisă: **`0005 — DEPOZIT 1`**.
- Stare: activ.

Salvarea produsului a folosit verificarea existentă **GetArticol**, exclusiv citire. FOM a afișat „Asociere salvată: … · BUC”.

Persistență verificată în Firestore:

| Înregistrare | ID | Revizie | Moment salvare |
| --- | --- | --- | --- |
| Gestiune | `e92307f2-fb04-44ea-be3f-57e1ffd26fba` | 1 | 20:20:41 |
| Produs | `9c9aa20d-7c94-4bfd-ba41-9093cbcfa883` | 1 | 20:21:11 |

Produsul păstrează în `warehouseIds` ID-ul gestiunii de mai sus. Codul gestiunii este stocat ca **`stringValue: "0005"`**, nu ca numărul 5. Produsul are `code: "WIFI4CHR3"`, `unit: "BUC"`, `kind: "goods"`, `active: true`. Verificarea articolului este înregistrată la **20:21:10**.

După redeschiderea paginii Setări, produsul și gestiunea erau încă prezente. Am deschis formularul produsului pentru consultare și am confirmat că gestiunea `0005` era bifată; am închis cu **Anulează editarea**, fără o nouă salvare.

## 3. Stoc pe gestiune explicită

În formularul FOM:

- Tip: **Stoc articol**.
- Cod: **WIFI4CHR3**.
- Gestiune: **0005**.
- Dată opțională: necompletată, pentru stocul curent SAGA.
- Rezultat afișat la **20:21:26**: **2 bucăți**, cu eticheta **Gestiune: 0005**.

Această consultare folosește **GetStocArticol**, nu un endpoint de modificare a stocului.

Comparație în SAGA Web, **Situații → Situație stocuri**:

- Gestiune: **DEPOZIT 1**.
- Articol selectat după codul exact **WIFI4CHR3**. Există și un articol cu denumire asemănătoare și alt cod; acesta nu a fost folosit pentru asociere sau rezultatul final.
- Interval de afișare: **01.11.2026–09.11.2026**.
- UM: **BUC**.
- Stoc inițial: **2.000**.
- Cantitate intrată în interval: **0.000**.
- Cantitate ieșită în interval: **0.000**.
- Stoc final: **2.000**.
- Disponibil: **2.000**.

**Rezultatul FOM coincide cu raportul SAGA: 2 bucăți în gestiunea corectă.** Nu a fost executată o operațiune de consum, transfer sau facturare pentru a testa stocul.

## 4. Importuri și probleme observate

### CSV — trecut

Export original: `/Users/code-with-a/Downloads/CSV_09-11-2026_20-25-13.csv`.

FOM a citit fișierul, a permis maparea coloanelor și a afișat un rând cu `00236`, BK TECHNIK SRL, RO13901263, RO. Confirmarea a salvat lista în FOM și a raportat **Import finalizat: 1/1**. Nu au fost pierdute zerourile codului.

### XLSX — eșuat în interfața publicată

Export original: `/Users/code-with-a/Downloads/XLSX_09-11-2026_20-23-31.xlsx`, 7.685 octeți. Sistemul local îl identifică drept Microsoft Excel 2007+.

După **Citește exportul**, FOM a afișat **„Fișier Excel invalid.”**. Nu au fost salvate date din această încercare. Cauza exactă nu a fost diagnosticată; mesajul nu dovedește că exportul SAGA este corupt. Am continuat cu exportul CSV original SAGA, fără fabricarea unei liste și fără modificarea datelor clientului.

### Cataloagele complete de referință — observație deschisă

În Setări → SAGA, zona cataloagelor de referință și cea a profilurilor afișează **„Datele de referință nu sunt disponibile momentan.”**. Catalogul de asocieri produse/gestiuni și fluxul listei de clienți descrise mai sus au funcționat. Cauza indisponibilității nu a fost determinată aici; importul integral al articolelor, tipurilor, agenților, termenelor și folosirea lor comercială nu sunt declarate testate.

## 5. Impact exact asupra sistemelor

### FOM/Firebase

Au fost salvate:

1. O gestiune în catalogul SAGA al FOM.
2. O asociere de produs, cu acea gestiune permisă și verificarea articolului.
3. O intrare de referință client din exportul CSV, împreună cu metadatele operațiunii de import FOM.
4. O legătură între clientul FOM existent și codul SAGA al clientului.
5. Metadatele tehnice ale conexiunii, prin consultările existente: stare, revizie și momentul ultimei citiri, plus cheia reînnoită dacă SAGA a furnizat-o.

Nu am salvat ciorne de factură, pregătit XML-uri, rezervat numere sau creat operațiuni de transfer. Nu am activat workerul ori importurile reale. Nu am publicat cod sau schimbat configurația Vercel/Firebase în această etapă.

### SAGA Web / API

**Nu am importat și nu am modificat datele comerciale sau contabile din SAGA.**

- Prin API, acțiunile inițiate de test au fost două consultări: verificarea articolului la salvarea asocierii și citirea stocului cu gestiune explicită. Nu am apelat **POST /Import**.
- Direct în interfață am consultat nomenclatoarele, am folosit căutarea după CUI, am descărcat două exporturi și am filtrat raportul de stoc. Nu am folosit salvarea unui client/produs/gestiuni sau validarea unui document.
- **Starea interfeței a fost schimbată:** căutare/filtre de afișare, formatul ales pentru export și intervalul raportului. Nu afirmăm că preferințele de afișare ale contului au rămas identice sau că SAGA nu a înregistrat jurnale de acces/export.
- **Cheia API poate fi reînnoită de SAGA la consultare.** Conectorul o gestionează criptat în FOM. Headerul nu a fost inspectat separat în această probă; nu afirmăm că rotația a avut sau nu a avut loc.
- Nu a fost efectuat un audit al tuturor operațiunilor realizate simultan de alți utilizatori în firma SAGA.

Distincție: **importul CSV executat aici este în FOM, nu în SAGA**. Exportul din interfața SAGA este o extragere de date, nu un import contabil.

## Dovezi și continuare

Dovezile provin din interfețele reale, rezultatele afișate de FOM și citirile autorizate ale câmpurilor de catalog/legătură din Firestore. Exporturile originale au rămas în Downloads; nu au fost adăugate în Git. Nu au fost salvate capturi de ecran ca artefacte.

Următoarele verificări trebuie să țină cont de eroarea XLSX și de indisponibilitatea referințelor. Asocierea pilotului este pregătită, dar verificarea comercială completă (preț protejat, TVA, monedă și sursa API din referințe) rămâne etapa următoare. Nu se deduce că asocierea simplă a produsului îl face deja eligibil pentru pregătirea facturii sub regulile comerciale noi.

- [Planul de testare](plan-testare-saga-productie.md).
- [Etapa 2 — conexiune și citiri](rezultate-testare-saga-etapa-2-2026-11-09.md).

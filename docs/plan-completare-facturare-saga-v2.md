# Plan 2 — completarea facturării după precizările clientului

Data analizei: **8 noiembrie 2026**. Sursă: mesajele clientului din 6 noiembrie și cele trei capturi anexate. Document de analiză și propunere; **nu autorizează implementarea și nu schimbă aplicația/SAGA**.

**Concluzie:** este necesar un plan de completare. Integrarea existentă rămâne baza tehnică, dar precizările schimbă regulile comerciale ale primei versiuni: serii pe utilizator, preț și TVA din SAGA, preț protejat pentru dispecer, agent, scadență automată și catalog complet de referință. Unele funcții vizibile în interfața SAGA nu sunt expuse prin API-ul public.

**Decizii confirmate de utilizator în această analiză:**

1. Adminul modifică prețul în SAGA; FOM îl recitește. Nu modificăm catalogul SAGA din FOM și nu introducem o suprascriere manuală a prețului sursă pe factura FOM.
2. Cursul EUR este **doar referință informativă pe facturi în RON**. Nu conversie de prețuri și nu emitere în EUR.
3. Seriile NRGV, NRGA și NRG sunt folosite **exclusiv prin FOM** după activare.

Rămân date de configurare și acceptare: UID-urile/permisiunile conturilor, ultimul număr verificat pe fiecare serie, exporturile complete, clarificările secundare de mai jos (sursa cursului a fost ulterior confirmată: BNR direct). Aceste lipsuri nu sunt prezentate ca funcții API disponibile.

## Starea implementării — 8 noiembrie 2026

**Planul 2, etapa 1 — cataloage de referință și profiluri de emitere: implementată local**, în urma aprobării explicite ulterioare analizei. [Implementare, API-uri și dovezi de verificare](saga-references.md).

Referințele sunt separate de asocierile și facturile existente. Salvarea profilurilor este pregătitoare: nu activează automat numerotarea pe utilizator și nu schimbă contoare. Activarea explicită este implementată în etapa 2. Nu s-au folosit exporturi reale, nu s-au configurat conturile clientului și nu s-a publicat nimic. Tabelele de mai jos descriu situația de la analiza inițială; starea actualizată a primei livrări este în documentul de implementare.

**Etapa 2 — numerotare pe utilizator: implementată local**, cu activare administrativă, contoare pe serie, alegerea UID-ului emitentului pe server și păstrarea documentelor istorice. [Comportament, API și verificări](invoice-user-numbering.md). Activarea pe conturile reale și publicarea nu au fost executate.

**Etapa 3 — editor și reguli comerciale: implementată local**, cu activare explicită, conversia confirmată a ciornelor, surse API protejate, TVA pe linii, scadență și note. [Contracte, utilizare și verificări](invoice-commercial-rules.md). Nu au fost activate reguli pe conturile reale și nu s-a publicat nimic.

**Etapa 4 — curs EUR informativ: implementată local**, cu sursă **BNR direct**, conform alegerii ulterioare a utilizatorului. Se folosește ultima publicare cel târziu la data facturii; lipsa unui curs permite omiterea confirmată. [Implementare, API, cache, XML v4 și verificări](invoice-eur-reference.md). Nu se face conversie și nu s-a publicat nimic.

## 1. Ce arată imaginile

1. **Agent:** lista afișează ALIN IONESCU `0004`, IONUT VOINEA-VAIDA `0002`, LILIANA IONESCU `0003`. Sunt coduri de agent SAGA, nu UID-uri FOM și nu seria facturii. Codurile și numele trebuie confirmate de admin înaintea configurării; imaginea nu verifică automat asocierea cu un cont FOM.
2. **Selectarea produsului după denumire:** lista afișează articole existente cu coduri, stocuri și prețuri. Sunt vizibile inclusiv prețuri `0.0000`, ceea ce cere o regulă explicită pentru articolele fără preț utilizabil.
3. **Selectarea după cod:** coduri precum `00000194` trebuie păstrate integral, ca text. Clientul cere căutare alternativă după cod sau denumire, cu stocul actual vizibil în rezultate. Nu este suficient un câmp liber cu denumirea comercială.

Structura urmărită în FOM:

- **Antet:** serie/număr, cod client automat, client/CUI, data emiterii, scadență, informații suplimentare, agent și curs EUR dacă este aplicabil.
- **Linii:** tip SAGA, gestiune, denumire, stoc, cod, UM, TVA, cantitate, preț unitar, valoare și informații suplimentare.
- Păstrăm editorul flotant nemodal și accesul la detaliile tichetului. Pe mobil folosim prezentarea în flux și gruparea câmpurilor, fără a reproduce un tabel desktop prea lat.

## 2. Comparație cu ce este implementat

| Cerință | Situație actuală verificată în cod | Completare necesară |
| --- | --- | --- |
| Facturare în tichet, fereastră flotantă | Implementat local | Se păstrează |
| Serii pe utilizator: NRGV / NRGA / NRG | Contoare tranzacționale există, dar configurația activă este una pe firmă | Profil de emitere pe UID și serii active simultan |
| Ultimul număr + 1 | Implementat în FOM după inițializare manuală | Separare pe fiecare serie; procedură de coexistență cu SAGA |
| Cod client completat automat | Asocierea existentă furnizează codul pentru XML | Afișare discretă, numai pentru citire; operatorul nu trebuie să-l tasteze |
| Căutare client după CUI/denumire și populare | Există listă importată și asociere explicită în pagina clientului | Autocompletare în factura tichetului, legată de același client FOM; completarea câmpurilor fiscale lipsă cere surse verificabile |
| Data curentă, editabilă | Implementat | Se păstrează |
| Scadență din SAGA sau azi | Câmp opțional, inițial gol | Termen de plată importat/confirmat, calcul automat și editare explicită |
| Informații suplimentare în antet | XML conține automat referința tichetului, fără câmp liber dedicat | Câmp liber separat, păstrând referința FOM |
| Agent după cod/nume SAGA | Neimplementat | Listă de referință, asociere și `FacturaAgent` în XML |
| Curs EUR din Infovalutar | Neimplementat; documentele actuale sunt în RON | Câmp informativ și sursă verificată; factură RON, fără conversie |
| Lista completă a tipurilor/articolelor | Catalog configurat manual, cu tip simplificat marfă/serviciu | Importul referinței complete și tipuri SAGA distincte |
| Lista gestiunilor | Configurare manuală de cod/denumire și gestiuni permise | Import de referință și validarea tipurilor de gestiune |
| Sugestii după nume/cod, cu stoc în listă | Filtrare în catalogul asociat; stoc la cerere pentru linia selectată | Selector unificat cu rezultate indexate și citiri graduale de stoc |
| UM din SAGA | Citită și păstrată la asociere; incompatibilitatea este semnalată | Completare automată și protejarea UM pe linia facturii |
| TVA din SAGA pe produs | Conectorul citește TVA, dar catalogul nu îl persistă; factura folosește TVA global | TVA pe fiecare linie și refacerea calculelor/snapshot-ului/XML-ului pentru versiunea nouă |
| Cantitate manuală | Implementat, cu precompletare din sursele tichetului | Se păstrează editarea și confirmarea operatorului |
| Preț declarat în SAGA, protejat pentru dispecer | Conectorul citește prețul, dar catalogul nu îl persistă; ambele roluri pot edita prețul ciornei | Politică de preț server, proveniență și drepturi pe rol |
| Fără preț declarat: neeligibil pentru facturare | Ciorna permite valori incomplete și preț zero | Blocare la pregătire/finalizare conform noii politici |
| Valoare = cantitate × preț | Calcul monetar pe server există | Se păstrează și se adaptează la TVA pe linii; cursul EUR nu schimbă valoarea |
| Informații suplimentare pe linie | Neimplementat | Câmp separat de denumire, transmis prin `InformatiiSuplimentare` |
| Import și compararea stocului | Implementate local, implicit dry-run | Test practic și închiderea fluxului final, deja rămase din primul plan |

**Diferențe față de planurile anterioare:**

- Prețul SAGA devine sursa comercială cerută; în prima etapă păstram prețurile devizului/raportului sau editarea operatorului.
- TVA pe linie este în acord cu direcția planului general, dar depășește limita explicită a primei versiuni implementate: TVA global.
- Numerotarea pe trei utilizatori extinde configurația actuală cu o singură serie activă pe firmă.
- Listele complete și scadența citită automat nu pot fi promise doar pentru că există în interfața SAGA.

## 3. Ce permite documentația SAGA Web

Sursă principală: [Documentația API](https://web.sagasoft.ro/DocumentatieAPI). [Articolul oficial](https://www.sagasoftware.ro/saga-web-api-uri-pentru-dezvoltatori/) confirmă un endpoint de import și cinci de interogare. Nu am apelat endpointurile firmei reale în această analiză.

### Confirmat pentru integrare

- **GetArticol:** citește un articol al cărui cod este deja cunoscut. Conectorul FOM existent interpretează denumire, UM, TVA și primul preț de vânzare din răspunsul XML (`Pret_Vanzare1`). Catalogul actual păstrează doar denumirea/UM, deci trebuie extins. Schema completă și semantica prețurilor în valută/preferențiale trebuie verificate pe răspunsuri reprezentative.
- **GetStocArticol:** citește stocul pe cod articol și gestiune; poate alimenta coloana din selector și verificarea finală deja implementată. Nu este un endpoint de căutare după denumire.
- **GetSituatieStocuri:** returnează un XML pentru o perioadă. Documentația nu garantează o listă completă a nomenclatorului, inclusiv articole fără mișcări/stoc zero, tipuri și gestiuni neutilizate. Nu îl declarăm înlocuitor al exportului complet fără un exemplu verificat.
- **Import:** transmite factura deja existentă în XML. Antetul admite `Cod`, `FacturaNumar`, `FacturaData`, `FacturaScadenta`, `FacturaAgent`, `FacturaInformatiiSuplimentare`. Liniile admit `CodArticolClient`, `Gestiune`, `UM`, `Cantitate`, `Pret`, `Valoare`, `ProcTVA`, `TVA`, `InformatiiSuplimentare`.
- Tipul SAGA este atributul articolului. Nu inventăm un tag `<Tip>` pe linia facturii: acel câmp este documentat pentru importul nomenclatorului de articole, nu în structura publicată a facturii. Factura identifică articolul existent prin cod.

### Nu este documentat ca operațiune API directă

- Listarea/căutarea tuturor clienților sau citirea termenului de plată al unui client.
- Listarea completă a articolelor, tipurilor, gestiunilor și agenților.
- Citirea ultimei facturi/următorului număr pe o serie sau rezervarea unui număr în SAGA.
- Un endpoint dedicat actualizării prețului unui articol existent.
- Un câmp `FacturaCurs` pentru antetul XML prezentat. `FacturaMoneda` există, dar nu dovedește că simpla ei completare reproduce funcția „Curs ref.” din interfață.

XML-ul `ART_...` permite importul articolelor cu `Cod`, `Tip`, `Pret`, `Pret_TVA` etc. Aceasta **nu dovedește** că un import cu un cod existent actualizează exclusiv prețul, fără duplicare sau alte schimbări. Dacă se dorește scrierea prețului în SAGA din FOM, este necesar un test separat și/sau un contract confirmat de SAGA. Nu includem această scriere în completarea standard.

**Soluția fezabilă pentru datele fără listare API:** liste de referință din exporturi complete furnizate de client, cu sursă și dată, importate controlat în FOM; `GetArticol` pentru verificarea/actualizarea datelor codurilor cunoscute, `GetStocArticol` pentru stoc. Listele importate nu sunt prezentate ca sincronizare online completă. Soldul și balanța nu rezolvă lipsa endpointurilor de nomenclatoare și nu sunt necesare pentru această cerință.

## 4. Planul de completare propus

### A. Date de referință și surse comerciale

- Extindem importul existent, cu previzualizare și confirmare, pentru articole, tipuri SAGA, gestiuni, agenți și datele suplimentare ale clienților. Reutilizăm mecanismul CSV/XLSX, progresul, reviziile și protecția Firestore; nu clonăm registrele clienților FOM.
- Cheile sunt firma + codul SAGA, tratat ca text. Importurile actualizează după cod și nu șterg automat intrările absente dintr-un fișier.
- Tipul contabil SAGA rămâne separat de clasificarea marfă/serviciu. Păstrăm codul/denumirea și proprietățile relevante ale tipului; nu deducem comportamentul stocului numai din etichetă.
- Persistăm UM, TVA, prețul comercial confirmat, moneda/regula lui dacă sunt cunoscute, proveniența și momentul verificării. Nu interpretăm un câmp lipsă ca zero.
- Pentru cataloage complete, căutarea și listele devin paginate/indexate pe server; nu încărcăm tot catalogul în fiecare linie a editorului.
- Cazurile de producție/rețete sau tipuri nestocate cu efecte asupra altor articole sunt marcate ca necesitând verificare separată. Verificarea actuală a diferenței pe SKU nu este considerată probă pentru descărcarea componentelor unei rețete.

### B. Utilizatorul emitent, seria și agentul

- Adminul configurează profilul de emitere pentru **UID-ul FOM**, nu prin potrivirea numelui: seria/plaja, formatul afișat, ultimul număr verificat și agentul implicit.
- Valorile cerute de client sunt puncte de configurare, nu date deja verificate:

| Utilizator indicat de client | Serie cerută | Exemplu de prim document | Agent afișat în captură |
| --- | --- | --- | --- |
| Ionuț Voinea | NRGV | `NRGV F260001` | `0002` |
| Alin | NRGA | `NRGA F260001` | `0004` |
| Liliana | NRG | `NRG F260001` | `0003` |

- Reutilizăm contorul tranzacțional per serie și rezervarea unică per tichet. Permitem cele trei serii simultan, fără resetarea contoarelor și fără altă alocare la retrimitere/reverificare.
- Numărul este ales după utilizatorul care confirmă emiterea/pregătirea definitivă, nu după autorul tichetului sau ultimul editor al ciornei. Previzualizarea identifică emitentul utilizator și seria; schimbarea lui invalidează confirmarea veche.
- Agentul comercial, utilizatorul FOM și firma emitentă sunt identități diferite. Selectarea altui agent nu schimbă automat seria utilizatorului. Codul agentului intră în `FacturaAgent` și este înghețat în snapshot.
- Păstrăm exemplele complete cerute: `NRGV F260001`, `NRGA F260001`, `NRG F260001`. Configurația poate reutiliza prefixele `NRGV F`, `NRGA F`, `NRG F` și partea numerică `260001`, cu lățime minimă 6. Confirmăm formatul acceptat la import. Nu deducem o resetare anuală din `26` și nu pornim de la primul număr dacă seria a avansat deja.
- **Condiție confirmată:** cele trei serii sunt controlate exclusiv de FOM. În aceste condiții continuăm fiecare contor automat cu +1, după inițializarea din ultimul număr verificat de admin. Dacă această exclusivitate se schimbă ulterior, integrarea nu poate coordona alocarea cu SAGA prin API-ul public; sunt necesare serii/plaje distincte sau un mecanism oficial suplimentar.

### C. Client, scadență și câmpurile antetului

- Păstrăm clientul FOM al tichetului și asocierea confirmată cu SAGA. Codul se completează automat; căutarea după CUI/denumire ajută identificarea în lista de referință. Un rezultat după nume nu produce automat asocierea și nu creează un client nou.
- Extindem referința clientului cu datele fiscale disponibile și **zilele de scadență** din export/date confirmate. Absența lor din export nu este prezentată ca verificare online a setării SAGA.
- Calcul propus: `data emiterii + zile scadență`; dacă lipsa unui termen este confirmată, valoarea implicită propusă este data emiterii. Pentru ziua curentă aceasta este „azi”, conform cererii. Tratăm separat „nu există termen” de „nu am putut obține termenul”.
- Dacă operatorul modifică explicit scadența, nu o suprascriem prin refresh. Schimbarea datei emiterii recalculează numai o scadență încă automată. Cazul unei emiteri antedatate cu scadență lipsă trebuie confirmat: data emiterii sau ziua curentă.
- Adăugăm informații suplimentare libere în antet și pe fiecare linie. Referința automată a tichetului se păstrează distinct și este inclusă împreună cu textul operatorului în câmpurile XML documentate.

### D. Selectorul produsului și politica de preț/TVA

- Introducem sugestii după cod sau denumire, cu tip, gestiune, UM, TVA, preț și stoc. Selectarea unui rezultat identifică un articol exact; denumirea singură nu creează un produs nou.
- Sugestiile caută în referința importată. Stocul rezultatelor vizibile se citește gradual, în loturi mici, prin conectorul comun; nu apelăm SAGA pentru fiecare literă tastată și nu presupunem stoc zero la eroare. Afișăm momentul citirii și gestiunea.
- La selectare, UM, TVA și prețul confirmat al articolului completează linia. Cantitatea rămâne editabilă. Prețul din deviz poate fi afișat pentru comparație, dar nu este folosit automat ca preț SAGA.
- Prețul sursă nu se modifică în FOM, nici de admin, nici de dispecer. Adminul îl schimbă în SAGA, apoi FOM îl recitește prin acțiune explicită. Serverul verifică prețul și revizia sursei la salvare/pregătire; o modificare concurentă cere actualizare explicită, fără suprascriere tăcută.
- Nu implementăm importuri ART pentru actualizarea prețurilor, endpointuri de scriere în nomenclatorul SAGA sau ajustări manuale ale prețului sursă în FOM. Prima implementare folosește prețul de vânzare deja citit de conector; prețuri alternative/preferențiale se acceptă numai după identificarea sursei exacte.
- Propunere conservatoare: un articol fără preț pozitiv confirmat nu poate ajunge la pregătire/trimitere. Clientul trebuie să confirme dacă prețul zero este permis ca gratuitate sau este considerat „fără preț declarat”. Ciorna incompletă rămâne salvabilă.
- Trebuie stabilit și dreptul la discount, pentru ca dispecerul să nu ocolească politica de preț prin reducere. Până la confirmare, propunem modificarea discountului numai de admin, cu audit.
- Trecem de la TVA global la TVA pe linie. Preluăm cotele confirmate din SAGA, fără a copia valorile istorice folosite ca exemple în manual. Discountul global, dacă rămâne permis, se repartizează determinist pe baze; TVA se calculează pe cote, cu totaluri monetare exacte. XML-ul folosește `ProcTVA`/`TVA` pentru fiecare linie. Nu convertim automat o UM în alta.

### E. Cursul EUR

- **Scop confirmat:** indicator informativ pentru o factură în RON. Cursul nu intră în calculul prețului, TVA-ului, discountului sau totalului.
- Manualul descrie „Curs ref.” ca multiplicator al prețului articolelor marcate în valută, inclusiv la Ieșiri–lei. Așadar, existența câmpului nu înseamnă automat factură în EUR.
- Cerința inițială era Infovalutar, al cărui serviciu nu a putut fi confirmat la analiză. **Ulterior, utilizatorul a acceptat BNR direct**, sursă folosită în etapa 4. Comportamentul livrat este descris în [invoice-eur-reference.md](invoice-eur-reference.md).
- După confirmarea sursei de date, păstrăm sursa, data cursului, momentul citirii și valoarea zecimală; cursul folosit se îngheață odată cu factura. Pentru zile nelucrătoare afișăm data reală a ultimului curs disponibil, fără a-l eticheta fals ca publicat azi.
- Chiar fără conversie, trebuie confirmat că prețul articolului folosit la factura RON este un preț RON. Un articol cu preț de bază în valută nu este tratat tacit ca RON; dacă sursa/regula prețului este neclară, articolul nu devine eligibil până la clarificare. Funcția SAGA „valută” nu este reprodusă automat.
- Nu adăugăm un tag `FacturaCurs` nedocumentat. XML-ul primește valorile RON ale facturii, fără conversie; referința cursului se păstrează în snapshot și, dacă este necesară în document, în informațiile suplimentare și viitorul PDF. Conversia EUR → RON și facturarea în EUR rămân în afara acestui plan.

### F. Compatibilitate și închiderea fluxului

- Extindem modelele existente cu versiune nouă de ciornă/snapshot și generator; ciornele vechi se pot redeschide, iar aplicarea noii politici se face explicit. XML-urile, numerele și operațiunile deja înghețate nu sunt regenerate sau resetate.
- Reutilizăm verificarea identității Firebase, validările server, reviziile/409, tokenul rotativ, coordonarea pe firmă, workerul și protecția împotriva retrimiterii. Toate noile surse și condiții de preț/TVA intră în amprenta previzualizării.
- Păstrăm distincte importul, diferența de stoc observată și validarea contabilă. Precizările nu demonstrează că importul Web descarcă marfa automat.
- Rămân necesare din primul plan: testul practic SAGA, reconcilierea administrativă, PDF-ul aceleiași facturi, statusurile finale/tichetele nefacturate/arhivarea și pilotul controlat. Nu le declarăm rezolvate de acest plan de autocompletare.

## 5. Ordinea recomandată și verificările

1. **Configurare și mostre:** identificarea UID-urilor/rolurilor celor trei conturi FOM, verificarea ultimelor numere și formatului acceptat de SAGA, a prețului de vânzare folosit și a regulii pentru valoarea zero. Exporturi complete de referință și răspunsuri anonimizate pentru articole RON/valută și clienți cu/fără termen.
2. **Cataloage + profiluri:** importuri/revizii/proveniență, tipuri, gestiuni, agenți, termene și serii pe UID.
3. **Editor + reguli server:** căutare după CUI/cod/denumire, câmpuri automate, agent/note/scadență, preț protejat și TVA pe linie.
4. **Curs EUR informativ** — implementat local în etapa 4, cu sursă BNR confirmată; fără conversie sau schimbarea monedei RON.
5. **Regresii + test în firma SAGA de test**, apoi completarea finalizării/PDF-ului și activarea controlată.

Criterii de verificare:

- Alocări concurente pe aceeași serie și pe serii diferite, schimbare de utilizator între preview/confirmare, retry fără număr nou, fără resetarea numerelor existente.
- CUI cu/fără RO, clienți omonimi, CUI duplicat, lipsă termen versus lipsă date, scadență automată/manuală și schimbarea datei emiterii.
- Coduri cu zerouri, articole cu același nume, tipuri și gestiuni incompatibile, stoc zero versus eroare și lipsa apelurilor SAGA per tastă.
- Cereri API falsificate de dispecer pentru preț/TVA/UM/discount; preț lipsă/zero, preț schimbat în SAGA după preview, recitire explicită și imposibilitatea modificării prețului sursă din FOM.
- TVA mixtă și zero pe linii, cantități zecimale, discount, independența totalurilor față de cursul informativ și concordanța exactă dintre linii, totaluri și XML.
- Agentul corect și textele libere în XML, UTF-8/escaping, păstrarea documentelor istorice și lipsa retransmiterii după timeout.
- Browser: sugestii și tastatură, fereastră flotantă, acces la tichet, ecrane înguste. Verificarea pe telefon fizic se raportează separat.
- Import de probă: număr/serie/agent/client/TVA/preț/scadență corecte în SAGA și observarea efectului asupra stocului, fără alte mișcări simultane.

La analiza inițială nu s-au executat teste și s-a adăugat numai acest document. Implementarea autorizată ulterior a etapei 1 și testele efectiv executate sunt documentate separat în [saga-references.md](saga-references.md).

## Surse oficiale consultate

- [SAGA Web — Documentație API](https://web.sagasoft.ro/DocumentatieAPI) — contractul prioritar pentru endpointuri și XML.
- [SAGA — API-uri pentru dezvoltatori](https://www.sagasoftware.ro/saga-web-api-uri-pentru-dezvoltatori/) — domeniul API-ului și importul automat.
- [SAGA C — Import date](https://manual.sagasoft.ro/sagac/topic-76-import-date.html) — referință suplimentară, fără extrapolarea validării desktop la Web.
- [SAGA C — Ieșiri lei](https://manual.sagasoft.ro/sagac/topic-32-iesiri---lei.html) — scadență, agent, curs de referință și completarea liniilor.
- [SAGA C — Terți](https://manual.sagasoft.ro/sagac/topic-17-terti.html) — zile scadență și asocierea agentului.
- [SAGA C — Agenți](https://manual.sagasoft.ro/sagac/topic-18-agenti.html) — coduri și date de agent.
- [SAGA C — Articole](https://manual.sagasoft.ro/sagac/topic-21-articole.html), [tipuri](https://manual.sagasoft.ro/sagac/topic-22-tipuri-de-articole-servicii.html), [gestiuni](https://manual.sagasoft.ro/sagac/topic-20-gestiuni.html) — UM, TVA, prețuri, valută și comportamente de stoc.
- [SAGA C — Numere și serii](https://manual.sagasoft.ro/sagac/topic-85-numere-si-serii.html) — serii pe utilizatori în interfața SAGA C, fără dovada unui API Web pentru alocare.

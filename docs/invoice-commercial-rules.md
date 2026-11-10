# Planul 2 — etapa 3: editor și reguli comerciale

**Completare locală — 10 noiembrie 2026:** articolele pot fi preluate direct după cod în editor, fără import. Confirmarea explicită și auditată a monedei RON în FOM este acceptată când moneda lipsește din export. [Fluxul, API-urile și verificările](invoice-saga-direct-articles.md). Pașii de configurare din export de mai jos rămân disponibili ca alternativă.

Implementare locală, **8 noiembrie 2026**. Nicio conectare la firma SAGA reală, nicio configurare a conturilor reale și nicio publicare.

## Configurare și activare

În **Setări → SAGA → Reguli comerciale SAGA**, adminul activează explicit politica pentru firma conectată. Configurarea este protejată prin revizie și confirmare. Activarea nu consumă numere, nu emite facturi și nu apelează SAGA.

Din „Legături explicite între referințe și asocierile FOM”, adminul alege articolul sau gestiunea din export și asocierea FOM existentă cu **exact același cod SAGA**. Articolele și gestiunile sunt legate separat. Nu se creează produse sau gestiuni noi și nu se potrivește după nume. Dacă UM a produsului diferă de ultima verificare API, actualizarea ei necesită confirmare explicită; crește revizia produsului, astfel încât ciornele vechi să semnaleze conflictul.

Pentru facturare, articolul trebuie să aibă ultima verificare API salvată (`GetArticol`) și **moneda RON în referința importată sau confirmată explicit de operator prin fluxul direct**. Datele de preț din export nu înlocuiesc verificarea API. Fără RON confirmat nu se presupune că prețul este în lei. Adminul modifică prețul în SAGA, apoi folosește recitirea existentă din catalogul de referință.

După activare, fiecare pregătire nouă de XML trebuie să respecte politica, inclusiv pentru ciorne create anterior. Facturile deja înghețate rămân intacte și pot fi redeschise, descărcate sau procesate prin fluxul existent cu aceiași octeți XML.

## Editorul tichetului

Se păstrează editorul flotant, deplasabil/minimizabil pe desktop și în flux pe ecrane înguste.

- Ciornele noi folosesc versiunea comercială 2 și discount zero. Produsele/cantitățile din tichet sunt păstrate ca punct de plecare; valorile comerciale neconfirmate rămân necompletate.
- Ciornele vechi folosesc **Aplică regulile SAGA**. Se afișează diferențele de UM/preț/TVA, scadență și date fiscale; confirmarea salvează explicit conversia fără rezervarea unui număr. **Actualizează regulile SAGA** recitește sursele salvate în FOM pentru o ciornă deja convertită. Niciuna dintre aceste acțiuni nu apelează SAGA.
- Datele beneficiarului deja editate se păstrează. Checkbox-ul pentru propunerea datelor din clientul FOM este opțional și cere comparare/confirmare. Nu se inventează adrese, conturi sau date fiscale lipsă. CUI-ul și țara completate trebuie să corespundă identității fiscale confirmate.
- Clientul FOM al tichetului rămâne același; codul SAGA este afișat automat. Căutarea după CUI/denumire este orientativă, în lista importată. Schimbarea legăturii se face de admin prin pagina clientului, fără crearea automată de clienți noi.
- Selectorul de articole caută după început de cod sau denumire, cu paginare pe server. Enter pornește căutarea, săgeata jos mută focalizarea la rezultate, săgețile sus/jos navighează, Enter selectează. Referințele neasociate, neverificate sau neeligibile sunt afișate cu motiv și nu pot fi alese pentru facturare.
- La selectare, prețul fără TVA este `Pret_Vanzare1`, iar UM și TVA provin din ultima verificare API. Cele trei câmpuri sunt numai pentru citire pentru admin și dispecer. Cantitatea, denumirea comercială și notele rămân editabile. Gestiunea se alege din cele permise produsului, iar pregătirea verifică și legătura cu referința importată.
- Stocul rămâne consultabil la cerere prin mecanismul existent. Nu se pornesc citiri SAGA la tastare, deschiderea editorului sau selectarea unui articol.
- Prețul lipsă/zero, TVA-ul lipsă, moneda neconfirmată și asocierile incomplete blochează pregătirea XML, dar permit salvarea ciornei incomplete. TVA zero este valid. Restricția de preț pozitiv privește prețul sursă; discountul aprobat păstrează intervalul existent 0–100%.
- Numai adminul poate modifica discountul global. Pentru pregătire, un discount nenul necesită **Aprob explicit discountul la salvare**. Discounturile din ciorne vechi nu sunt considerate aprobate retroactiv. Modificările și aprobările adminului sunt auditate; dispecerul păstrează procentul aprobat, fără să-l poată schimba.
- Informațiile suplimentare din antet și fiecare linie au maximum 2.000 de caractere și sunt independente de denumiri și referința tichetului.
- Agentul este afișat din profilul utilizatorului curent și este validat/înghețat pentru utilizatorul care confirmă XML-ul. Nu există schimbare manuală a agentului în editor.

### Scadență

Termenul provine din lista de referință legată de codul clientului SAGA:

- `days`: data emiterii + numărul de zile, inclusiv zero;
- `none`: lipsa confirmată a termenului → data emiterii;
- `unknown` sau lipsa referinței: scadență necompletată, necesită introducere manuală înainte de pregătirea XML.

Modificarea datei emiterii recalculează numai o scadență automată. Editarea scadenței o trece în mod manual; „Revino la scadență automată” reaplică termenul curent al ciornei. O scadență anterioară emiterii este respinsă. Schimbarea termenului în referințe produce conflict și cere actualizarea explicită a regulilor; o scadență manuală este păstrată la această actualizare.

## Contracte și protecții

Baza integrării `/api/integrations/saga`:

| Metodă / cale | Acces și rezultat |
| --- | --- |
| `GET commercial-policy` | admin/dispecer; starea politicii și dreptul de administrare |
| `PUT commercial-policy` | admin; `{expectedRevision, confirmed:true}`; activare, fără dezactivare implicită |
| `GET commercial-bindings/{referenceId}` | admin/dispecer; legătura existentă |
| `PUT commercial-bindings/{referenceId}` | admin; `targetId`, `expectedRevision`, `expectedReferenceRevision`, `expectedTargetRevision`, opțional `confirmUnit` |
| `GET commercial-products?q=&field=code\|name&cursor=` | admin/dispecer; pagina de articole, asocieri, proveniență și motive de indisponibilitate |

În tichet:

- `GET /api/lucrari/{id}/invoice-draft/commercial-context`: client, termen, agent și politica curentă, fără apel SAGA.
- `POST .../commercial-preview`: `{expectedRevision, content, applyBeneficiary?}` → propunere, diferențe/avertizări și `confirmationHash`, fără scrieri.
- `PUT .../invoice-draft`: păstrează contractul existent și acceptă suplimentar `commercialHash` pentru conversie/actualizare confirmată și `approveDiscount` pentru admin.

Serverul verifică rolul Firebase și contul activ, firma din configurație, revizia ciornei, politica, identitatea fiscală, termenul, produsul/gestiunea, referința, legătura și verificarea API. Valorile comerciale falsificate sunt respinse; sursele schimbate răspund `409`, păstrând editările locale. Snapshot-urile trimise de browser nu sunt autoritative. Nu se poate reveni din versiunea 2 la versiunea 1, iar schimbarea datelor sursă nu poate introduce implicit versiunea nouă într-o ciornă veche.

Persistare separată sub `sagaCatalogs/{codFiscal}`:

- `commercialPolicy/current`: activarea și revizia politicii;
- `commercialBindings/{referenceId}`: referință → asociere FOM, revizii și autor;
- `commercialDiscountAudit/{id}`: modificări/aprobări ale discountului, tichet, procent, autor și dată.

Aceste subcolecții sunt deja protejate de excluderea întregului `sagaCatalogs` din accesul direct Firestore. Nu sunt necesare indecși sau reguli noi. Se păstrează bariera existentă `SAGA_READS_ENABLED`; variabile noi nu sunt necesare. Publicarea regulilor de protecție existente rămâne necesară înaintea activării în cloud.

Ciorna nouă păstrează proveniența articolului, TVA pe linie, notele, modul și sursa scadenței, revizia politicii și aprobarea discountului. Recalcularea și rezolvarea surselor sunt reverificate pe server. Citirea surselor comerciale nu garantează detectarea unei schimbări făcute în SAGA după ultima recitire API salvată; nu este sincronizare continuă.

## Calcule și XML

Calculele comerciale folosesc aritmetică `BigInt`: prețuri de până la 8 zecimale, cantități de până la 4, baze monetare la cent. Discountul global se repartizează prin resturi maxime, cu departajare după ordinea liniilor. TVA se calculează pe fiecare cotă și se repartizează pe liniile acelei cote; totalurile liniilor, grupelor și documentului coincid exact.

Generatorul nou este versiunea **3**. Folosește cotele liniilor, `FacturaAgent`, `FacturaInformatiiSuplimentare` pentru referința tichetului plus nota operatorului și `InformatiiSuplimentare` pe linii, conform structurii [SAGA Web](https://web.sagasoft.ro/DocumentatieAPI). UTF-8, escaping-ul XML și numele fișierului sunt păstrate.

Prețul net după discount are maximum 8 zecimale și trebuie să reproducă valoarea monetară a liniei; altfel pregătirea este blocată. Rezervarea numărului și salvarea documentului/artifactului rămân în aceeași tranzacție. Orice eroare XML anulează inclusiv incrementarea. Validarea artefactului din fluxul de transmitere înțelege noile cote, note și agentul, păstrând compatibilitatea versiunilor 1/2 și a octeților istorici.

## Fișiere și verificări

Principalele fișiere noi: `lib/invoicing/commercial.ts`, `commercial.server.ts`, `commercial-http.ts`, `commercial-runtime.server.ts`, rutele descrise mai sus, `components/settings/invoice-commercial-settings.tsx`, `components/invoicing/invoice-commercial.tsx`, `lib/invoicing/commercial.test.ts` și `scripts/test-invoice-commercial.ts`. Integrarea extinde serviciul/modelul ciornei, editorul, generatorul/verificarea XML și tabul SAGA, fără rescrierea conectorului sau workerului.

Verificări locale, cu date fictive: **toate cele 35 de teste unitare și cele șase suite API/emulator/browser de mai jos au trecut**.

- `npm run test:invoice-commercial`: **8 teste** — TVA mixt/zero, repartizări exacte, zecimale, termen zero/necunoscut și calendar, limitele notelor, refuzul aprobării falsificate, XML escapate/agent/note, verificarea artefactului nou și compatibilitatea istoricului.
- `npm run test:invoice-commercial:integration`: Auth/Firestore izolate pe proiectul demo `demo-fom-commercial`. Acoperă activarea, conversia explicită, câmpuri și discount protejate, preferarea API față de export, surse schimbate, termene, CUI neconcordant, downgrade/refacere surse, acces Firestore refuzat și rollback fără număr consumat. În browser verifică activarea și legătura gestiunii, căutarea clientului, migrarea, selecția articolului din tastatură, TVA mixt, scadență automată/manuală, note, pregătire și redeschidere la 320/390 px. Documentul comercial nou trece și intrarea în fluxul de transmitere **dry-run**, cu gateway care refuză orice apel extern. Captura locală este `/tmp/fom-commercial-ticket-mobile.png`.
- Regresii unitare: `test:invoice-draft` **10**, `test:invoice-xml` **8**, `test:invoice-saga` **9**.
- Regresii API/emulator/browser: `test:invoice-draft:integration`, `test:invoice-xml:integration`, `test:invoice-user-numbering:integration`, `test:invoice-saga:integration`, `test:saga:integration`.
- TypeScript global are **212 diagnostice înainte și după**, cu aceleași numere de diagnostice pe fișier/cod TS; fișierele modificate nu introduc diagnostice noi. Nu a fost reparată infrastructura de tipuri din afara acestei etape.

Testele refuză traficul extern și folosesc numai transport SAGA simulat. Nu s-au verificat prețurile/termenii/conturile din firma reală și nu s-a testat pe telefon fizic sau într-o publicare Next.js. Activarea pe firma reală, exporturile reale și publicarea sunt operațiuni ulterioare. Cursul EUR, PDF-ul și confirmarea practică a descărcării stocului rămân separate.

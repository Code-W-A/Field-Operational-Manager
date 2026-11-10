# Plan de testare FOM–SAGA în producție

Actualizare locală **10 noiembrie 2026**: [finalizarea unificată](invoice-finalization.md) înlocuiește cele două confirmări din etapele 10–11 cu un rezumat și o singură confirmare. Numerotarea, XML-ul și operațiunea persistentă sunt salvate împreună. În mod real, workerul poate începe importul imediat după confirmare; nu există o pauză garantată pentru inspectarea XML-ului numerotat înainte de trimitere. Pentru repetiția sigură se folosește dry-run, care rezervă numărul numai în FOM. Această implementare nu a fost publicată și nu a făcut apeluri SAGA reale.

Data: 9 noiembrie 2026.

**Etapa 4 — parțial verificată:** UM, TVA și prețul articolului real coincid între FOM și SAGA; 16 teste unitare și cele două suite API/emulator/browser au trecut. Verificarea completă în producție este blocată de indexurile de referință lipsă și de configurarea comercială neafișată/inactivă. [Raport și impact asupra SAGA](rezultate-testare-saga-etapa-4-2026-11-09.md).

**Etapa 3 — scenariu pilot verificat:** asociate în FOM clientul BK TECHNIK (SAGA `00236`), articolul `WIFI4CHR3` și gestiunea `0005`; stocul explicit este 2 bucăți, confirmat în raportul SAGA. CSV: trecut; exportul XLSX real: respins de FOM; cataloagele complete de referință afișează indisponibilitate. [Raportul complet și impactul asupra SAGA](rezultate-testare-saga-etapa-3-2026-11-09.md).

**Etapa 2 — citire reală verificată:** firma/CUI-ul coincid, datele articolului `WIFI4CHR3` coincid cu SAGA, iar stocul total returnat este 2 bucăți, neschimbat după citiri. [Raportul și limitele verificării](rezultate-testare-saga-etapa-2-2026-11-09.md). Nu au fost trimise facturi sau activate importuri în această probă.

**Etapa 1 verificată la 9 noiembrie 2026:** [auditul inițial](rezultate-testare-saga-etapa-1-2026-11-09.md) a identificat protecții Firestore, worker și indexuri nepublicate. Ulterior, utilizatorul a autorizat publicarea limitată a acestora; [starea actualizată și verificările sunt în raportul publicării](publicare-saga-etapa-1-2026-11-09.md). Workerul rămâne oprit și integrarea reală nu a fost activată prin această publicare. Nu au fost efectuate apeluri către SAGA.

## Scop și stare

Pilot controlat pe firma reală SAGA, folosind aplicația FOM publicată pe Vercel. Verificăm funcțiile preliminare, apoi urmărim o singură factură reală de la tichet până la import și mișcarea de stoc din SAGA.

Acesta este un plan, nu un raport de teste executate. Salvarea documentului nu activează integrarea și nu pornește operațiuni reale. Configurația efectiv publicată trebuie verificată în etapa 1; documentația locală nu reprezintă dovadă de publicare.

## Etapele de testare

| Etapă | Ce testăm în FOM | Ce verificăm în SAGA și ce dovezi păstrăm |
| --- | --- | --- |
| **1. Configurația publicată** | Verificăm versiunea Vercel, regulile Firestore, indexurile, workerul și firma conectată. Importurile rămân dezactivate până la finalizarea verificărilor preliminare. | Confirmăm CUI-ul firmei. Înregistrăm versiunea aplicației, ora și configurația activă, fără chei sau secrete. |
| **2. Conexiunea API** | Citim un articol cunoscut și repetăm citirea. Verificăm funcționarea conexiunii și gestionarea cheii reînnoite, dacă SAGA o furnizează. | Comparăm codul, denumirea și UM cu articolul din SAGA. Păstrăm rezultatul și ora citirii, fără token. Două citiri reușite nu demonstrează rotația dacă nu s-a primit o cheie nouă. |
| **3. Cataloagele și asocierile** | Importăm referințele necesare și verificăm asocierea clientului, articolului și gestiunii. Codurile cu zerouri trebuie păstrate integral. | Comparăm codurile și CUI-ul cu înregistrările SAGA. Păstrăm sursa exportului, data, capturile și identificatorii folosiți. Importul referințelor se salvează în FOM. |
| **4. Preț, UM și TVA** | Recitim articolul; verificăm autocompletarea și protejarea prețului, UM și TVA pentru admin/dispecer. Verificăm moneda RON și momentul ultimei citiri. | Comparăm cu datele articolului din SAGA, inclusiv prețul sursă folosit. Nu schimbăm prețuri reale doar pentru test. |
| **5. Utilizator, serie și agent** | Verificăm profilurile emitenților și numărul estimat. Deschiderea și salvarea ciornei nu trebuie să consume numere. Configurările necesare sunt consemnate. | Clientul confirmă ultimul număr utilizat, seria exclusivă FOM și agentul. Păstrăm estimările; nu pregătim XML-uri suplimentare doar pentru probă. |
| **6. Editorul și ciorna** | Verificăm deplasarea, minimizarea, accesul la detaliile tichetului, salvarea/redeschiderea și păstrarea datelor, inclusiv pe ecrane înguste. | Nu este așteptată apariția unui document în SAGA. Păstrăm capturi și ID-ul tichetului. |
| **7. Scadența și informațiile suplimentare** | Verificăm termenul importat, calculul automat, modificarea manuală, agentul și notele din antet/linii. Termenul necunoscut trebuie diferențiat de lipsa confirmată și de zero zile. | Comparăm termenul și agentul cu datele confirmate din SAGA. Păstrăm valorile așteptate pentru factura pilot. |
| **8. Cursul EUR și calculele** | Verificăm sursa/data BNR, păstrarea cursului, TVA pe linii, discountul autorizat și totalurile. Cursul informativ nu trebuie să schimbe totalul RON. | Pregătim un calcul independent pentru comparația cu factura importată. Păstrăm cursul, data publicării și totalurile așteptate. |
| **9. Stocul înainte de facturare** | Citim stocul fiecărui articol în gestiunea exactă și cumulăm liniile repetate. Erorile nu sunt tratate ca stoc zero. | Confirmăm aceleași cantități în SAGA. Păstrăm capturi cu ora, codul și gestiunea; stabilim un interval fără alte mișcări pe articolele pilotului. |
| **10. Rezumat și confirmare unică** | Înainte de confirmare verificăm beneficiarul, emitentul/seria, agentul, liniile, stocul, notele și totalurile. Renunțarea păstrează ciorna fără număr. Confirmarea rezervă numărul, salvează XML-ul și creează operațiunea persistentă atomic. | În mod real, pregătirea workerului și a modului se face înainte de confirmarea pilotului. După confirmare importul poate începe imediat. **Numărul alocat nu se resetează și nu se reciclează automat.** |
| **11. Importul unic** | Fără o a doua confirmare, urmărim operațiunea creată la etapa 10. Păstrăm XML-ul descărcat și hash-ul, răspunsul și raportul de import. Limităm utilizarea reală la pilot. | Căutăm factura după număr și client; confirmăm că există o singură dată și comparăm datele, liniile, gestiunile, prețurile, TVA-ul și totalurile. Păstrăm răspunsul API, raportul și capturile documentului. |
| **12. Stocul și validarea** | Comparăm citirile înainte/după și rezultatul afișat în FOM, separat de rezultatul importului. | Verificăm starea documentului și mișcarea de ieșire asociată facturii, în evidențele disponibile în SAGA. Cantitatea scăzută trebuie să corespundă facturii. Consemnăm dacă a fost necesară validare manuală și păstrăm starea de dinaintea intervenției. |
| **13. Redeschidere și reverificare** | Reîncărcăm pagina, redeschidem documentul și folosim reverificarea stocului. Numărul, XML-ul și operațiunea trebuie să rămână aceleași. | Confirmăm că factura rămâne unică și că reverificarea nu creează alt document sau altă descărcare. Păstrăm rezultatul și ora reverificării. |

## Condiții înainte de importul real

- Alegem împreună cu clientul o factură reală care trebuie emisă, cu datele și seria confirmate.
- Verificăm că documentul nu a fost deja emis sau importat separat în SAGA.
- Înregistrăm tichetul, operatorul, clientul, articolele, gestiunile și cantitățile pilotului.
- Stabilim cine verifică documentul și mișcarea de stoc în SAGA și cine gestionează eventualele corecții contabile.
- Confirmăm finalizarea etapelor preliminare înainte de activarea importului.
- Folosim conexiunea securizată existentă. Mediile care folosesc aceeași cheie trebuie să coordoneze cheia reînnoită; nu pornim o conexiune independentă cu o copie veche.

Activarea importurilor este o configurație a aplicației, nu o limitare automată la o singură factură. Pe durata pilotului trebuie controlat accesul operatorilor la trimitere. După pilot consemnăm dacă importurile rămân active sau sunt oprite; oprirea nu anulează documente deja trimise.

## Tratarea problemelor

- **Import parțial, timeout sau rezultat incert:** oprim fluxul și verificăm manual în SAGA înainte de orice altă trimitere. Nu retransmitem automat.
- **Import confirmat, stoc neschimbat sau diferență incorectă:** păstrăm rezultatele și verificăm documentul/gestiunea în SAGA. Reverificarea execută numai citiri.
- **Mișcări simultane în SAGA:** comparația cantităților nu mai este suficientă pentru atribuirea diferenței acestei facturi; verificăm mișcarea asociată documentului.
- **Validare manuală necesară:** înregistrăm că importul singur nu a produs descărcarea automată și descriem intervenția necesară.
- **Corecție contabilă necesară:** se efectuează prin procedura agreată cu clientul și contabilul, păstrând istoricul operațiunii. Nu ștergem documente sau resetăm numere pentru a ascunde rezultatul testului.

Timeouturile, XML-urile invalide, întreruperile, cererile concurente și celelalte erori provocate intenționat se verifică prin simulări. Nu le provocăm pe factura reală din producție.

## Raportarea către client

Pentru fiecare etapă completăm:

| Câmp | Conținut |
| --- | --- |
| Etapă și rezultat | Trecut / eșuat / neconfirmat / neexecutat |
| Data și operatorul | Ora cu fusul Europe/Bucharest și persoana care a executat verificarea |
| Identificatori | Versiunea aplicației, tichetul, operațiunea, numărul facturii, codurile relevante |
| Rezultat așteptat | Ce trebuia să se întâmple |
| Rezultat observat în FOM | Ce a afișat și persistat aplicația |
| Rezultat observat în SAGA | Document, stare, mișcare de stoc și eventuală intervenție manuală |
| Modificări efectuate | Ce s-a schimbat efectiv în fiecare sistem |
| Dovezi | Capturi, XML, hash, raport de import și stoc înainte/după, păstrate în spațiu privat |
| Problemă și acțiune | Ce trebuie corectat și cine preia acțiunea |

Raportăm separat:

1. **Import confirmat:** răspunsul și documentul din SAGA au fost verificate.
2. **Diferență de stoc observată:** înainte minus după corespunde cantității facturate.
3. **Validare/descărcare confirmată în SAGA:** starea și mișcarea aferente documentului au fost verificate, cu precizarea dacă procesul a fost automat sau manual.

Simpla diferență de stoc nu dovedește validarea contabilă. Câmpurile contabile existente ale tichetului și raportul de nefacturate nu sunt actualizate de fluxul de transfer descris în implementarea actuală; verificăm și consemnăm acest comportament, fără să îl prezentăm ca închidere completă a facturării.

## Referințe

- [Documentația oficială SAGA Web](https://web.sagasoft.ro/DocumentatieAPI): import, coduri de răspuns și cheia reînnoită.
- [Implementarea transferului și verificării stocului](invoice-saga-transfer.md).
- [Planul de completare a facturării](plan-completare-facturare-saga-v2.md).
- [Numerotare pe utilizator](invoice-user-numbering.md).
- [Reguli comerciale](invoice-commercial-rules.md).
- [Curs EUR informativ](invoice-eur-reference.md).

# Finalizarea facturii printr-o singură confirmare

Actualizare **10 noiembrie 2026**: [configurarea facturării din utilizator](invoice-user-setup.md) salvează profilul și activează contorul dintr-o singură acțiune. Datele comune lipsă se pot completa din factură, iar instrumentele SAGA sunt grupate în administrare avansată. Livrare locală, cu teste simulate, fără configurarea seriilor reale sau publicare.

Implementare locală: **10 noiembrie 2026**. Nu s-a publicat aplicația și nu s-au activat importuri reale. Verificările acestei livrări folosesc exclusiv emulatoare și transport simulat; nu au fost efectuate citiri sau importuri în firma reală SAGA.

## Utilizare

1. În editorul flotant, operatorul completează factura și apasă **Emite și trimite în SAGA**. În `dry-run`: **Simulează emiterea și trimiterea**.
2. FOM salvează automat modificările. Un conflict oprește continuarea, păstrează formularul local și permite compararea versiunii salvate.
3. În același editor apare rezumatul: beneficiar/cod SAGA/date fiscale, firmă emitentă, operator/serie/număr estimat, agent, date/scadență, curs informativ, produse, gestiuni, cantități și total. În mod real se citesc stocurile gestiunilor explicite și se cumulează liniile repetate.
4. **Confirmă emiterea și trimiterea** rezervă numărul, îngheață XML-ul și creează operațiunea persistentă în aceeași tranzacție. În simulare butonul spune explicit **Confirmă simularea emiterii și trimiterii**.
5. Rezultatele importului și ale stocului sunt afișate separat. Workerul continuă fără pagina deschisă; la redeschidere se citește progresul salvat.

**Înapoi la ciornă** păstrează ciorna salvată și nu consumă un număr. **Salvează ciorna** rămâne acțiune separată. XML-ul se descarcă din **Detaliile documentului**, fără pas tehnic suplimentar în fluxul principal.

În simulare nu se consultă SAGA, iar rezumatul nu prezintă un stoc fictiv ca fiind real. Confirmarea unei simulări **rezervă totuși numărul în FOM și îngheață documentul**, conform fluxului de numerotare existent. Mesajul este explicit înainte de confirmare. Simulările workerului rămân în colecția lor separată.

## API și stocare

- `POST /api/lucrari/[id]/invoice-finalization/preview`: `{ expectedRevision }`. Returnează rezumatul, `previewId`, expirarea, modul, grupurile de stoc, problemele și `canConfirm`. O operațiune deja începută este returnată fără noi citiri de stoc.
- `POST /api/lucrari/[id]/invoice-finalization`: `{ previewId, operationId }`, răspuns `202` cu documentul și transferul. Nu acceptă prețuri, numere, UID emitent sau XML autoritativ din browser.
- Ambele cer Firebase verificat, rol admin/dispecer și cont activ. Firma provine din configurația serverului. Răspunsurile au `Cache-Control: private, no-store`.
- `sagaCatalogs/{codFiscal}/finalizationPreviews/{id}` păstrează privat snapshot-ul rezumatului, citirile, UID-ul, tichetul, revizia ciornei, amprenta surselor și configurației de import, data și expirarea în zece minute. Protecția existentă pentru întregul `sagaCatalogs` acoperă și aceste documente; nu sunt necesare reguli noi.
- Expirarea este verificată pe server. Nu este configurată o politică TTL de ștergere automată a rezumatelor în această livrare.
- Confirmarea recitește toate sursele și verifică amprentele. Schimbarea ciornei, emitentului, catalogului, numerotării, utilizatorului sau modului cere un rezumat nou (`409`). Estimarea include și revizia contorului.
- Rezervarea contorului, `invoices/{workId}`, `invoiceArtifacts/{workId}`, operațiunea deterministă din `invoiceSagaTransfers`/`invoiceSagaSimulations` și marcarea rezumatului finalizat au un singur commit. Toate citirile tranzacției preced scrierile; XML-ul este generat fără efecte externe.
- Erorile de generare sau de scriere a operațiunii anulează și alocarea. Retry/dublu click/confirmări concurente reutilizează documentul și operațiunea. Un document pregătit anterior își păstrează exact numărul, emitentul și octeții XML.
- API-urile anterioare XML și transfer rămân compatibile; editorul principal folosește acum finalizarea unificată.

## Stoc și limite SAGA

În mod real, rezumatul citește prin conectorul existent `GetStocArticol` cu cod articol și gestiune, fără `data`. Lipsa citirii, datele neinterpretabile și stocul insuficient blochează confirmarea înainte de numerotare. Serviciile sunt excluse. Previzualizarea nu rezervă marfă.

Workerul existent recitește stocul înainte de import, apoi păstrează citirile și diferențele după import. Dacă stocul a devenit insuficient, documentul și numărul rămân păstrate, iar trimiterea este oprită. Operatorul poate relua fluxul principal: rezumat nou și confirmare, folosind același document. Un rezultat importat/parțial/incert nu este reînscris în coadă pentru alt import.

Timeoutul, rezultatul ambiguu sau importul parțial cer reconciliere. **Reverifică stocul (fără retrimitere)** execută exclusiv citiri. Nu completăm `numarFactura`, `statusFacturare` sau `facturaDocument` și nu schimbăm raportul de nefacturate.

[API-ul oficial SAGA Web](https://web.sagasoft.ro/DocumentatieAPI), recitit la implementare, documentează importul cu `importAutomat=true` și consultarea stocului. Nu documentează un apel separat „Validez”. Acceptarea XML-ului, validarea efectivă și descărcarea mărfii în SAGA rămân **neconfirmate practic**. Diferența observată nu este prezentată drept dovadă de validare contabilă.

## Configurare și fișiere

Se reutilizează [configurația și workerul existente](invoice-saga-transfer.md). Modul implicit rămâne `SAGA_IMPORT_MODE=dry-run`. Nu s-au schimbat `.env`, credențialele, regulile, indexurile, funcțiile Firebase sau activarea producției. Publicarea și orice probă reală sunt pași separați.

Fișiere principale:

- `components/invoicing/invoice-finalization-panel.tsx`: acțiunea unică, rezumat, confirmare, recuperare după răspuns pierdut și descărcare secundară.
- `invoice-draft-section.tsx`: autosalvare și blocarea editării pe durata finalizării; `invoice-saga-panel.tsx`: progres/reverificare fără confirmare separată în fluxul nou.
- `lib/invoicing/finalization.server.ts`, `finalization-http.ts`, `finalization-runtime.server.ts` și cele două rute noi: autorizare, rezumate private și orchestrare atomică.
- `xml.server.ts`, `saga-transfer.server.ts`, `saga-transfer.ts`: puncte interne de compunere tranzacțională, reutilizând generatorul, alocatorul și workerul existente.
- `scripts/test-invoice-finalization.cases.ts` și suitele browser existente adaptate la noua acțiune; alias npm `test:invoice-finalization:integration` reutilizează harness-ul izolat XML/Auth/Firestore/browser.

## Verificări executate

- **67/67 teste de domeniu**: `npx tsx --test lib/invoicing/*.test.ts lib/saga/*.test.ts` — calcule, TVA, discount, XML, numerotare, EUR, conector și cataloage.
- **Finalizare + XML, API/emulatoare/Chrome**: autosalvare, conflict cu editări păstrate, anulare fără număr, autorizare, acces Firestore direct refuzat, UID/tichet diferit, cont dezactivat, expirare/mod/revizii/surse schimbate, stoc cumulat insuficient/indisponibil, rollback dacă scrierea cozii eșuează, concurență/retry, stoc devenit insuficient după numerotare și reluare, documente istorice identice, statusuri contabile păstrate.
- Browser: focusul rezumatului, renunțare, confirmare cu răspuns pierdut intenționat **după commit**, recuperare prin GET, document înghețat, procesare server fără cerere din pagină, redeschidere/progres și descărcare privată; afișare la 320/390 px.
- **Transmitere SAGA, API/emulatoare/Chrome**: succes/parțial/eșec/timeout/incert, lease-uri și rotația tokenului, întreruperi și prevenirea dublării, stoc neschimbat/diferență/erori, raport privat și reverificare fără import. Transportul upstream este injectat.
- **Regresii comerciale și EUR, API/emulatoare/Chrome**: preț/UM/TVA protejate, articole direct în editor, gestiuni, scadență automată/manuală, note, TVA mixtă, curs/omitere, istorice și mobil.
- **Ciorna și editorul flotant, API/emulatoare/Chrome**: precompletare, salvare/redeschidere, interacțiune cu tichetul din spate, deplasare prin antet/tastatură, minimizare, închidere cu editări nesalvate, comparație la conflict și mobil.
- **Numerotare pe utilizator, API/emulatoare/Chrome**: contoare independente, serie din identitate, concurență, rollback, istorice, activare și mobil.
- Typecheck global: aceleași **212 diagnostice (122 distincte)** ca în baseline-ul anterior; nicio eroare nouă identificată în fișierele schimbate. Nu reprezintă un typecheck global curat sau un build de producție validat.

Toate suitele de integrare pornesc proiecte Firebase `demo-*`, cu transportul extern blocat sau injectat. Nicio factură nu a fost trimisă în SAGA real și nu s-au modificat date în SAGA prin panou sau API.

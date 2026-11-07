# Asocierea clienților existenți FOM–SAGA

Implementare locală: **7 noiembrie 2026**. Lista SAGA este o referință separată în FOM. Această etapă nu apelează API-ul SAGA, nu modifică SAGA și nu creează/actualizează documentele registrului `clienti` din FOM.

## Utilizare

1. Admin: **Setări → SAGA → Clienți SAGA · listă de referință**. Alege un export CSV UTF-8 sau XLSX, maximum 10 MB și 5.000 de rânduri de date. Prima linie este antetul. CSV acceptă separator `;`, `,` sau tab, ghilimele și BOM UTF-8; XLSX permite alegerea foii.
2. Alege coloanele pentru cod, denumire, CUI/CIF și țară. Codul și denumirea sunt obligatorii. Țara lipsă trebuie completată explicit cu două litere, pe rând sau pentru întregul import. CUI-ul poate lipsi.
3. Verifică previzualizarea, editabilă și paginată câte 25 de rânduri. Celulele Excel numerice/calculate folosite drept cod sunt marcate: corectează codul, inclusiv zerourile inițiale, sau confirmă explicit verificarea lui. Codurile text rămân neschimbate. Datele sunt validate înaintea salvării; duplicatele identice se reunesc, cele contradictorii blochează operațiunea.
4. Confirmă salvarea listei în FOM. Progresul se actualizează la fiecare lot. În caz de întrerupere, reselectează același fișier, foaie, coloane și aceleași corecturi: importul activ este recunoscut și continuă de la primul lot nesalvat. Un import diferit este blocat până la finalizarea sau anularea celui activ. Anularea cere confirmare și păstrează loturile deja salvate.
5. În **Clienți → client existent → Asociere SAGA**, adminul confirmă țara fiscală FOM, caută după cod/denumire/CUI sau cere propuneri după CUI. Potrivirile fiscale folosesc CUI normalizat și aceeași țară, fără asociere automată după denumire. Adminul alege un rezultat și confirmă explicit legătura. CUI-uri/țări diferite și aliasurile fiscale FOM contradictorii blochează asocierea. Lipsa CUI într-o sursă cere confirmare suplimentară.
6. Legătura afișează firma SAGA, codul/denumirea clientului, sursa exportului și momentul confirmării. Poate fi schimbată sau eliminată cu confirmare. Dispecerul o poate doar consulta. Mai multe locații ale aceluiași client preiau aceeași legătură; mai mulți clienți FOM cu aceeași identitate fiscală pot indica același cod SAGA.
7. Ciorna facturii afișează asocierea clientului identificat sigur din tichet și un link către clientul FOM. Identificarea folosește `clientId`/`clientInfo.id`, cu compatibilitate pentru un nume legacy unic; un nume ambiguu nu produce asociere. Schimbările din lista SAGA/datele fiscale FOM semnalează necesitatea reconfirmării. Modificarea CUI în ciornă afișează diferența, păstrând câmpurile editate și posibilitatea salvării unei ciorne incomplete.

Sursa listei este **exportul furnizat de admin**, fără verificare online. Datele importate nu suprascriu beneficiarul din ciornă, devizul, clientul FOM sau documentele istorice. Intrările absente dintr-un export ulterior nu sunt șterse automat.

## Persistență și API

Toate datele se află sub `sagaCatalogs/{codFiscal}`, deja exclus din accesul direct SDK/REST prin regulile locale:

- `clients/{sha256(codSAGA)}`: cod text, denumire, CUI original, țară, revizie, sursă, momentul importului și autor. Reimportul aceluiași cod actualizează aceeași înregistrare. Revizia se schimbă numai când denumirea/CUI/țara diferă.
- `clientLinks/{fomClientId}`: referința clientului SAGA, revizia lui confirmată, țara fiscală confirmată a clientului FOM, CUI normalizat la confirmare, confirmarea CUI lipsă, revizia legăturii, autor și dată. Eliminarea lasă un document inactiv cu revizia următoare.
- `clientImports/{id}` și `clientImports/control`: operațiune, sursă, număr de rânduri, amprente SHA-256 ale loturilor, progres și blocaj comun pe firmă. Loturile sunt tranzacționale, de maximum 200 de rânduri. Reluarea unui import activ folosește aceeași operațiune; după finalizare, același export poate fi importat din nou ca operațiune nouă, fără duplicarea clienților. Duplicate contradictorii între loturi sunt respinse și pe server.

Fișierul original este citit local în browser; parserul Excel este încărcat numai la cerere. Către backend se trimit manifestul mic și loturile normalizate, nu fișierul de 10 MB într-o singură cerere. Serverul revalidează toate rândurile, amprentele și drepturile în tranzacții. Nu se păstrează fișierul original sau o cheie SAGA în aceste colecții.

| Interfață | Acces și comportament |
| --- | --- |
| `GET /api/integrations/saga/clients?q=&country=&mode=tax` | Admin/dispecer; căutare în lista locală, maximum 100 de rezultate și numărul total. `mode=tax` folosește potrivire fiscală exactă. |
| `POST /api/integrations/saga/clients/preview` | Admin; validarea rândurilor normalizate. Previzualizarea foii și corecturile sunt locale în browser. |
| `POST /api/integrations/saga/clients/imports` | Admin; `{source,total,hashes}`. Creează sau reia importul activ compatibil. |
| `GET /api/integrations/saga/clients/imports?id=` | Admin/dispecer; progresul operațiunii cerute sau al importului activ. |
| `POST /api/integrations/saga/clients/imports/{id}/batch` | Admin; `{index,rows}`. Lotul repetat este idempotent; o amprentă diferită este refuzată. |
| `POST /api/integrations/saga/clients/imports/{id}/cancel` | Admin; eliberează importul activ, păstrând loturile deja salvate. |
| `GET/PUT /api/clienti/{id}/saga-link` | Citire admin/dispecer; modificare admin cu `expectedRevision`, clientul SAGA, revizia lui, țara confirmată și eventuala confirmare a lipsei CUI. `sagaClientId:null` elimină legătura. |
| `GET /api/lucrari/{id}/invoice-draft/client-association` | Admin/dispecer; asocierea curentă, rezolvată pe server din clientul tichetului. Nu schimbă ciorna. |

Conflictele de revizie și importurile concurente produc `409`; datele fiscale incompatibile sunt respinse cu `400`. Asocierea este refuzată în timpul unui import activ. Conturile dezactivate sunt refuzate. Scrierile păstrează bariera `SAGA_READS_ENABLED=true`; publicarea regulilor pentru `sagaCatalogs` trebuie făcută înaintea activării. Configurația/cheile nu au fost schimbate în această etapă.

## Dovezi locale

```sh
npm run test:saga:clients
npm run test:saga:clients:integration
```

- 5 teste de domeniu/parser: CSV, XLSX, coduri cu zerouri/numerice/formule, țări, aliasuri fiscale, duplicate, limite și fișiere invalide.
- API + Firebase Auth/Firestore pe emulatoarele izolate `demo-fom-saga-clients` (porturi 9395/8395): roluri și cont dezactivat, progres pe mai multe loturi, reluare idempotentă, serializare și anulare, reimport, amprente falsificate, duplicate contradictorii între loturi, conflicte de revizie, CUI/țară incompatibile, lipsă CUI cu confirmare, rezultate fiscale multiple, locații, schimbări de referință, client ambiguu, izolare între firme și refuz Firestore direct inclusiv admin.
- Componentele React reale în Chrome headless peste API/emulatoare: CSV și Excel, alegerea foii/coloanelor, corectarea codului numeric, progres, selecția explicită dintre clienți cu același CUI, consultare dispecer, ciorna cu CUI editat păstrată după salvare/redeschidere, lățimi 320/390 px și confirmarea eliminării. Capturi: `test-results/saga-clients/`.
- Registrul `clienti` și tichetul de test rămân identice înainte/după. Testul refuză cereri HTTP externe și confirmă că nu apare niciun document în `sagaConnections`.
- Regresii trecute: `test:saga`, `test:invoice-draft`, `test:saga:integration`, `test:saga:catalog` și `test:invoice-draft:integration`.
- Typecheck global: diagnosticele preexistente persistă; comparația nu a identificat diagnostice noi, doar deplasarea liniilor în pagina clientului modificată.

Nu a fost utilizat un export real, nu au fost efectuate apeluri către SAGA și nu au fost publicate aplicația sau regulile. Verificarea pe telefon fizic și utilizarea în producție rămân pași separați. Următoarea etapă funcțională este seria/numerotarea și generarea XML, urmate de importul într-o firmă de test și confirmarea separată a validării/descărcării stocului.

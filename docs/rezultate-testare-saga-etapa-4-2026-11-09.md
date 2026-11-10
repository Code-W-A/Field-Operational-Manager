# Rezultate — etapa 4: preț, UM și TVA

Data: **9 noiembrie 2026**, Europe/Bucharest. Citirea reală a articolului: **20:48:09**.

## Verdict

**Citirea și compararea datelor reale au trecut. Testele izolate au trecut. Verificarea completă a regulilor comerciale în producție rămâne blocată.** Nu confundăm funcționarea în emulator cu activarea în aplicația publicată.

## Comparația reală FOM–SAGA

Firma: NRG ACCESS SYSTEMS S.R.L., CUI `34272913`. FOM: `https://fom-nrg.vercel.app`.

Am folosit acțiunea existentă „Consultă articolul” din Setări → SAGA, apoi am consultat nomenclatorul Articole din SAGA Web, fără editare.

| Câmp | Răspuns afișat în FOM | Nomenclator SAGA Web |
| --- | --- | --- |
| Cod | `WIFI4CHR3` | `WIFI4CHR3` |
| Denumire | RELEU INTELIGENT WIFI SONOFF 4CH R3 CU 4 CANALE | Aceeași denumire |
| UM | BUC | BUC |
| TVA | 21% | 21% |
| Preț vânzare 1 / preț vânzare | 128.0992 | 128.0992 |

SAGA afișa și prețul cu TVA `155.0000`, respectiv stocul curent `2.000`. Nu am produs mișcări de stoc. Moneda RON nu a fost confirmată în referința comercială pentru facturare prin această simplă consultare; răspunsul afișat nu constituie o confirmare a monedei.

## Blocaje constatate în producție

**Actualizare ulterioară, 20:56:53:** la cererea utilizatorului au fost publicate cele două indexuri lipsă. Ambele sunt READY, iar interogările răspund HTTP 200. [Raportul publicării](publicare-indexuri-referinte-saga-2026-11-09.md). Celelalte blocaje de mai jos nu au fost remediate prin această publicare.

1. **Catalogul de referință nu poate fi consultat:** cele două interogări după `kind + codeSearch` și `kind + nameSearch` au răspuns Firestore `400 / FAILED_PRECONDITION`, cu mesajul „The query requires an index”. Indexurile `referenceItems` există în configurația locală, dar lipsesc din lista indexurilor publicate. Verificarea s-a făcut prin interogări de citire, fără creare de indexuri.
2. **Configurarea regulilor comerciale nu este afișată:** `components/settings/saga-tab.tsx` importă `InvoiceCommercialSettings`, dar nu o include în JSX. Secțiunea lipsește și în pagina publicată consultată.
3. **Politica comercială nu este activată:** citirea documentului `sagaCatalogs/34272913/commercialPolicy/current` a răspuns `404 NOT_FOUND`. Implementarea interpretează lipsa documentului ca politică dezactivată. Nu am activat-o global pentru a executa testul.

În aceste condiții, nu declarăm verificate în producție autocompletarea comercială, blocarea câmpurilor în editor pentru cele două roluri sau pregătirea XML sub politica nouă. Nu am creat o ciornă reală și nu am rezervat numere doar pentru test.

## Teste izolate executate

| Comandă | Rezultat |
| --- | --- |
| `npm run test:invoice-commercial` | 8/8 teste trecute |
| `npm run test:saga:references` | 8/8 teste trecute |
| `npm run test:invoice-commercial:integration` | Suita API/emulator și browser trecută; reluată cu succes după extinderea testului pentru admin |
| `npm run test:saga:references:integration` | Suita API/emulator și browser trecută |

Aceste suite folosesc date izolate și transport SAGA simulat, fără acces la firma reală. Acoperă prețul/UM/TVA protejate, precedența datelor API, discountul autorizat, conflictele surselor, TVA mixtă, scadența, note, importuri CSV/XLSX sintetice, permisiuni și acces direct Firestore refuzat. Verificarea browserului include lățimi 320 și 390 px.

Am extins `scripts/test-invoice-commercial.ts`: cererile falsificate pentru preț, UM și TVA sunt acum verificate explicit atât pentru dispecer, cât și pentru admin; toate cele șase încercări sunt respinse cu `403`.

În logul suitei comerciale apare un răspuns EUR `409 EUR_FUTURE_DATE`, deoarece data curentă a browserului este ulterioară ceasului fix al fixture-ului. Suita se încheie cu cod 0; aceasta nu este dovadă a unei erori EUR în producție.

Succesul fișierelor XLSX sintetice nu rezolvă respingerea exportului XLSX real consemnată în etapa 3. Acea problemă rămâne deschisă.

## Impact asupra sistemelor

- **SAGA:** o consultare reală `GetArticol` prin FOM și navigare în pagina Articole. Nu am apelat `Import`, nu am creat/modificat facturi, clienți, produse, prețuri, TVA sau gestiuni și nu am executat validări ori descărcări de marfă.
- **Autentificare:** citirea folosește conectorul existent; acesta poate persista în FOM cheia reînnoită primită de la SAGA. Nu am verificat independent headerul de rotație și nu pretind că autentificarea nu poate avea efecte de sesiune/audit.
- **FOM producție:** consultarea a actualizat starea conexiunii/ora ultimei citiri afișate. Auditul configurației și al indexurilor a fost numai de citire. Nu am schimbat politica firmei, ciornele, facturile sau contoarele.
- **Local:** am extins un test și am redactat raportul; rularea emulatorului poate actualiza logurile locale. Nu am publicat cod, reguli, indexuri sau funcții.

## Următoarea acțiune

Remedierea afișării configurării și publicarea strict a celor două indexuri lipsă, apoi verificarea referințelor comerciale și activarea controlată a politicii. După acestea reluăm testul în editorul publicat, înainte de trecerea la factura pilot. Acest raport nu reprezintă executarea acestor remedieri sau autorizarea unui import real.

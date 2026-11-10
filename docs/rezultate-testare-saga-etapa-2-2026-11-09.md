# Rezultate — etapa 2: citire reală articol și stoc SAGA

Data: **9 noiembrie 2026**, fus orar `Europe/Bucharest`.

## Rezultat

**Verificare reușită pentru articol și stocul total al unui articol real.** Au fost folosite interfața FOM din producție și sesiunea SAGA existentă. Nu a fost necesară extragerea cheii API în terminal sau browser.

## Firma verificată

- FOM: `https://fom-nrg.vercel.app/dashboard/setari?tab=saga`.
- Firma configurată în FOM: CUI **34272913**.
- Firma afișată în selectorul SAGA: **NRG ACCESS SYSTEMS S.R.L. — 34272913**.
- SAGA: nomenclatorul `https://web0.sagasoft.ro/sagac/Articole`.
- FOM înainte de citire: **Pregătită pentru consultare**.
- FOM după citiri: **Conexiune verificată**.

## Articolul și comparația

Articolul a fost ales din lista existentă SAGA, fără creare sau modificare.

| Câmp | Interfața SAGA | Rezultat API afișat în FOM | Verdict |
| --- | --- | --- | --- |
| Cod | `WIFI4CHR3` | `WIFI4CHR3` | Coincide |
| Denumire | RELEU INTELIGENT WIFI SONOFF 4CH R3 CU 4 CANALE | RELEU INTELIGENT WIFI SONOFF 4CH R3 CU 4 CANALE | Coincide |
| UM | BUC | BUC | Coincide |
| TVA | 21 | 21 | Coincide |
| Preț vânzare 1 | 128.0992 | 128.0992 | Coincide |
| Stoc total | 2.000 | 2 | Aceeași cantitate |

Interfața SAGA mai afișează prețul cu TVA `155.0000`; acesta nu a fost un câmp separat returnat în rezultatul FOM verificat. Nu deducem din această probă confirmarea monedei din referințele comerciale sau eligibilitatea completă a articolului pentru pregătirea XML.

## Consultări executate prin FOM

1. **Articol:** selectat „Articol”, cod `WIFI4CHR3`, apoi „Consultă articolul”. Rezultat reușit afișat la **20:14:38**. Conectorul existent folosește `GET /Situatii/GetArticol` pentru această operațiune.
2. **Stoc:** selectat „Stoc articol”, același cod, gestiune și dată lăsate necompletate, apoi „Consultă stocul”. Rezultat reușit afișat la **20:14:59**, cantitate **2**, cu etichetele **Toate gestiunile** și **Data curentă din SAGA**. Conectorul existent folosește `GET /Situatii/GetStocArticol`.

După aceste consultări am reîncărcat pagina Articole în SAGA. Același articol afișa în continuare UM `BUC`, TVA `21`, stoc `2.000`, preț `128.0992` și preț cu TVA `155.0000`.

Rezultatul stocului a rămas deschis în fila FOM pentru consultarea utilizatorului. Dovezile acestei verificări sunt valorile și stările observate în arborii de accesibilitate ai paginilor reale; nu au fost salvate capturi de ecran sau exporturi brute ale răspunsurilor HTTP.

## Ce s-a modificat și ce nu a fost executat

- **În SAGA:** au fost consultate firma și lista articolelor din browser și au fost pornite două citiri API prin FOM. Nu am folosit Adaugă/Modifică/Șterge, nu am importat XML, nu am creat facturi, nu am validat documente și nu am inițiat mișcări de stoc. Stocul articolului a fost același înainte și după.
- **În FOM/Firebase:** consultările au folosit conectorul existent, cu blocajul comun și actualizarea datelor tehnice ale conexiunii: ultima citire/stare/revizie și gestionarea securizată a cheii curente. Nu au fost salvate asocieri de catalog, ciorne, facturi sau rezervări de numere de către această verificare.
- **Cheia reînnoită:** conectorul implementează salvarea criptată a headerului `X-Saga-Refresh-Token`, când este furnizat. Cele două citiri consecutive au reușit, dar interfața nu expune headerul; nu afirmăm că rotația efectivă a fost observată independent în această probă. Nu am generat manual o cheie și nu am modificat variabile de mediu.
- **Vercel/worker:** nu am publicat aplicația, modificat configurația sau activat procesarea/importul prin această verificare.

Afirmațiile de mai sus privesc acțiunile executate în acest test, nu un audit complet al operațiunilor efectuate de alți utilizatori în firmă în același interval.

## Limite și următorul pas

- Este verificată citirea unui singur articol și a stocului său agregat. Citirea cu gestiune explicită, importantă pentru facturare, rămâne de verificat separat.
- Nu au fost testate în această etapă importul facturii, validarea contabilă sau diminuarea stocului.
- Workerul și simularea nu au fost activate prin această acțiune. Urmează configurarea parolei comune Firebase–Vercel și a workerului în modul de simulare, cu importurile reale dezactivate.
- Apoi continuăm verificările catalogului, asocierilor și regulilor comerciale din plan, înaintea pilotului unei facturi reale.

## Referințe

- [Plan de testare în producție](plan-testare-saga-productie.md).
- [Publicarea limitată Firebase](publicare-saga-etapa-1-2026-11-09.md).

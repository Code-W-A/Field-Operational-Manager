# Rezultate — etapa 1: configurația publicată FOM–SAGA

Verificare: **9 noiembrie 2026, aproximativ 19:48–19:54, Europe/Bucharest**.

**Actualizare ulterioară:** la cererea utilizatorului au fost publicate selectiv protecțiile SAGA/facturare și cele trei funcții, iar cele două indexuri au fost create. [Starea publicării și verificările ulterioare](publicare-saga-etapa-1-2026-11-09.md). Constatările de mai jos reprezintă auditul inițial, anterior remedierii.

## Verdict

**Etapă neacceptată pentru continuarea pilotului real.** Aplicația este publicată, însă protecțiile Firestore pentru facturare/SAGA, workerul și indexurile aferente nu sunt publicate. Configurația proiectului Vercel nu include variabilele de activare a importurilor și secretul workerului.

## Rezultate efective

| Verificare | Rezultat | Dovezi și limite |
| --- | --- | --- |
| Identitatea proiectului Vercel | Confirmată | `v0-field-operational-manager`, ID `prj_jLaPZFy3uf8oXVbvK6wI7HAu9is4`, corespunzător legăturii locale `.vercel/project.json`. Citire prin conectorul Vercel. |
| Deployment de producție | READY | `dpl_Exh99zPjZtPuGc5y7GEVy4vLCdGd`; commit `79c79e4642dcc4c14337c203e629cfc3e7b4f817`, ramura `18feb`. Commitul coincide cu HEAD local la verificare. READY nu dovedește funcționarea fluxului complet. |
| Domeniu și disponibilitate | Confirmate | `https://fom-nrg.vercel.app/` răspunde HTTP 200. Aliasul este atașat deploymentului verificat. |
| Autorizarea endpointului de status | Confirmată pentru cerere anonimă | `GET /api/integrations/saga/status`, fără autentificare: HTTP 401 și `Cache-Control: private, no-store`. Nu s-a executat o verificare autentificată și nu s-a apelat endpointul de citire SAGA. |
| Proiect Firebase configurat în Vercel | Confirmat | `NEXT_PUBLIC_FIREBASE_PROJECT_ID=field-operational-manager`, același proiect ca în `.firebaserc`. |
| Variabilele conexiunii SAGA | Prezență confirmată, valori sensibile neverificate | Există `SAGA_API_KEY`, `SAGA_COD_FISCAL`, `SAGA_API_BASE_URL`, `SAGA_TOKEN_ENCRYPTION_KEY`, configurate pentru production ca sensitive. Cheia nu a fost testată; valoarea CUI-ului, adresa și cheia de criptare nu au fost extrase. Identitatea firmei SAGA rămâne de confirmat prin status autorizat/configurația operatorului. |
| Bariera de citire/scriere FOM | Activă în configurația proiectului | `SAGA_READS_ENABLED=true`. Acest flag permite și unele scrieri FOM; nu verifică automat publicarea regulilor Firestore. |
| Activarea importurilor | Variabile absente din configurația proiectului | Nu apar `SAGA_IMPORT_MODE` și `SAGA_IMPORTS_ENABLED`. Codul commitului publicat folosește implicit `dry-run` și importuri reale dezactivate. Nu am citit mediul efectiv din procesul deploymentului și nu am executat o operațiune pentru a testa bariera. |
| Secretul workerului Next.js | Lipsește din configurația proiectului | `SAGA_WORKER_SECRET` nu apare în lista variabilelor Vercel. Codul refuză autorizarea workerului în lipsa unui secret valid. |
| Regulile Firestore publicate | **Blocaj critic** | Release `cloud.firestore`, actualizat la `2026-11-02T21:47:03.100656Z`; ruleset `26239617-9ce5-4537-89a2-330ae79bbbaa`. Sursa publicată diferă de fișierul local și nu exclude colecțiile noi din regulile generale permisive. |
| Proba accesului direct anonim | **Protecție lipsă confirmată pentru citire** | GET-uri fără token pe ID-uri inexistente în `sagaConnections`, `invoiceSagaReports`, `invoiceDrafts` au returnat HTTP 404 NOT_FOUND, nu 403 PERMISSION_DENIED. Coroborat cu sursa regulilor, citirea nu este refuzată de autorizare. Nu s-au citit documente existente. |
| Protecția scrierilor directe | **Lipsește în sursa regulilor publicate** | Regulile generale permit create/update/delete pentru colecțiile noi, fără excluderea lor în `serverOnlyCollection`. Nu am executat scrieri pentru a demonstra practic acest lucru. |
| Funcțiile workerului SAGA | **Nepublicate** | `firebase functions:list --project field-operational-manager --json`: 25 funcții publicate, niciuna SAGA. Lipsesc `onInvoiceSagaTransferQueued`, `onInvoiceSagaSimulationQueued`, `processPendingSagaTransfers`. |
| Indexurile workerului | **Nepublicate** | API-ul Firestore a returnat 30 indexuri, fără indexuri pentru `invoiceSagaTransfers` sau `invoiceSagaSimulations`. Local sunt definite indexuri pe `fiscalCode`, `mode`, `phase`, `nextAt`. |

Lista Vercel de variabile reprezintă configurația proiectului la momentul auditului. Prezența unei variabile nu dovedește o valoare corectă sau validitatea credențialelor. Nu au fost extrase secrete și nu s-au încărcat credențiale în browser.

## Protecțiile Firestore care lipsesc

Sursa publicată nu exclude următoarele colecții din accesul direct general, spre deosebire de fișierul local:

- `sagaConnections`, `sagaCatalogs`, `invoiceDrafts`;
- `invoiceNumbering`, `invoiceCounters`, `invoiceNumberReservations`, `invoiceIssuerProfiles`;
- `invoices`, `invoiceArtifacts`;
- `invoiceSagaTransfers`, `invoiceSagaSimulations`, `invoiceSagaReports`, `invoiceSagaCompanyLeases`;
- `invoiceExchangeRateCache`, `invoiceExchangeRateQuotes`.

Regulile generale se aplică și subcolecțiilor. Protecția API-urilor Next.js nu compensează accesul direct Firestore permis. Cheia SAGA este proiectată să fie criptată în stocare, dar protejarea accesului la documentele conexiunii, catalogului, contoarelor și rapoartelor rămâne obligatorie. Nu s-a verificat dacă există deja documente în aceste colecții și nu se afirmă că date au fost accesate de alte persoane.

## Impactul acestei verificări asupra sistemelor

- **SAGA:** zero cereri, zero importuri, zero documente create/modificate, zero mișcări de stoc inițiate, zero rotații de token declanșate de acest audit.
- **Vercel:** exclusiv citiri de metadate deployment/proiect/configurație și două GET-uri publice FOM; fără modificarea variabilelor sau deployment.
- **Firebase:** exclusiv listarea funcțiilor, citirea release-ului/sursei regulilor și indexurilor, plus trei GET-uri anonime pe ID-uri inexistente; fără scrieri, fără creare de operațiuni și fără invocarea workerului.
- **Local:** acest raport și legătura din plan. Nu a fost schimbat codul aplicației sau mediul local. CLI-urile pot actualiza cache-uri/loguri locale de autentificare.

O primă probă cu ID rezervat de forma `__...__` a returnat HTTP 400 și nu a fost folosită drept dovadă de autorizare; proba a fost repetată cu un ID valid inexistent, obținând 404.

## Acțiuni necesare înainte de continuare

1. Prioritar: revizuirea și publicarea protecțiilor Firestore pentru documentele și subcolecțiile de mai sus, apoi verificarea refuzului accesului direct, inclusiv pentru admin. Publicarea nu a fost executată în acest audit.
2. Confirmarea explicită în Vercel a `SAGA_IMPORT_MODE=dry-run` și `SAGA_IMPORTS_ENABLED=false` pentru verificările preliminare, după care verificarea configurației deploymentului activ. Lipsa variabilelor folosește valorile implicite, dar nu constituie o configurație explicită auditată a runtime-ului.
3. Publicarea indexurilor și celor trei funcții, configurarea URL-ului FOM, firmei, modului și secretului comun Next.js/Functions, inițial pentru simulare. Nu se activează procesarea reală fără verificarea operațiunilor restante și a configurației.
4. Reverificarea etapei 1. Abia apoi etapa 2: o citire SAGA controlată, prin conexiunea existentă, cu persistența cheii reînnoite. Citirea poate roti cheia; nu creează prin ea însăși o factură sau o mișcare de stoc.
5. Confirmarea CUI-ului firmei reale și a datelor pilotului înainte de orice import.

Aceste acțiuni sunt recomandări rezultate din audit, nu operațiuni executate. Nu a fost început pilotul de facturare.

## Referințe

- [Planul de testare](plan-testare-saga-productie.md).
- [Deployment inspectat](https://vercel.com/shik-projects/v0-field-operational-manager/Exh99zPjZtPuGc5y7GEVy4vLCdGd).
- [Implementarea transferului](invoice-saga-transfer.md).

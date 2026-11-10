# Publicare limitată SAGA — 9 noiembrie 2026

## Scop autorizat

Publicarea exclusivă a protecțiilor pentru colecțiile noi SAGA/facturare, a celor trei funcții worker și a indexurilor lor, păstrând regulile, funcțiile și indexurile existente din celelalte module.

Firma SAGA nu este contactată în această operațiune. Nu se activează importuri sau procesarea operațiunilor restante.

## Reguli Firestore

Publicate la `2026-11-09T18:02:14.138165Z` în proiectul `field-operational-manager`:

- Ruleset: `e93069df-774c-4437-8ab8-58c6fe38aa85`.
- SHA-256 sursă publicată: `78bfa86ae3b0d99335c63a48a2e78374d55fa2ffcc7c0c154f9c5fd7a87c2188`.
- Modificarea a fost construită peste sursa publicată din cloud, nu prin publicarea integrală a fișierului local care conține și alte modificări.
- Singura diferență este extinderea funcției `serverOnlyCollection` cu cele 15 colecții de mai jos. Restul sursei regulilor este identic cu versiunea publicată anterior, verificat prin comparație.

Colecții protejate, inclusiv subcolecțiile:

`sagaConnections`, `sagaCatalogs`, `invoiceDrafts`, `invoiceNumbering`, `invoiceCounters`, `invoiceNumberReservations`, `invoiceIssuerProfiles`, `invoices`, `invoiceArtifacts`, `invoiceSagaTransfers`, `invoiceSagaSimulations`, `invoiceSagaReports`, `invoiceSagaCompanyLeases`, `invoiceExchangeRateCache`, `invoiceExchangeRateQuotes`.

**Verificare reală:** 30 GET-uri anonime pe ID-uri inexistente — câte un document și un document din subcolecție pentru fiecare colecție — refuzate integral cu HTTP 403. Nu au fost citite documente reale sau efectuate scrieri de probă în Firestore. Compilarea regulilor prin Firebase a trecut. Refuzul accesului autentificat și al scrierilor nu a fost probat prin operațiuni pe date reale; sursa publicată exclude aceste colecții din regulile generale indiferent de rol.

## Indexuri

Au fost solicitate strict două indexuri noi, prin API-ul Firestore, fără publicarea integrală a definițiilor locale și fără ștergerea altor indexuri:

| Colecție | ID index | Câmpuri |
| --- | --- | --- |
| `invoiceSagaTransfers` | `CICAgJjFqZMK` | `fiscalCode`, `mode`, `phase`, `nextAt`, crescător |
| `invoiceSagaSimulations` | `CICAgJjmnIgK` | `fiscalCode`, `mode`, `phase`, `nextAt`, crescător |

Firestore adaugă implicit și ordonarea după `__name__`. Cele 30 de indexuri preexistente sunt păstrate. Starea finală de construire este consemnată în verificarea finală de mai jos.

## Funcții și parolă internă

Publicarea este limitată explicit la:

```text
functions:onInvoiceSagaTransferQueued
functions:onInvoiceSagaSimulationQueued
functions:processPendingSagaTransfers
```

Regiune: `europe-west1`. Workerul este configurat cu `SAGA_WORKER_ENABLED=false` și `SAGA_IMPORT_MODE=dry-run`. Publicarea nu reprezintă activare; funcțiile se opresc înainte de a contacta FOM sau de a consulta coada dacă workerul este dezactivat.

Pentru legarea secretului cerut de funcții a fost activat Secret Manager și generată criptografic o parolă internă, salvată în `SAGA_WORKER_SECRET`, versiunea 1. Contului de serviciu al funcțiilor i s-a acordat acces la acest secret. Valoarea nu este inclusă în documentație sau frontend. Aceasta nu este cheia API SAGA. Nu a fost modificată sau regenerată cheia SAGA.

Prima încercare de publicare a funcțiilor a fost refuzată de Firebase deoarece runtime-ul Node.js 20 este dezafectat pentru publicări. Configurația sursei `firebase-functions/package.json` și declarația corespunzătoare din `package-lock.json` au fost actualizate la Node.js 22. Publicarea selectivă folosește noul runtime doar pentru cele trei funcții selectate; celelalte funcții publicate nu sunt migrate. O viitoare publicare integrală ar folosi noul runtime și trebuie tratată separat.

## Explicația configurației rămase

- **Modul de import** (`SAGA_IMPORT_MODE`): alege simulare sau operare reală. `dry-run` nu trimite documente în SAGA.
- **Permisiunea de import** (`SAGA_IMPORTS_ENABLED`): încă un întrerupător; trebuie activat explicit pentru transmiterea reală.
- **Activarea workerului** (`SAGA_WORKER_ENABLED`): permite funcțiilor Firebase să proceseze operațiunile. Acum este oprită.
- **Parola internă** (`SAGA_WORKER_SECRET`): permite Firebase să apeleze backendul FOM; la activare trebuie configurată aceeași valoare și în Vercel.
- **Adresa și firma workerului** (`SAGA_WORKER_APP_URL`, `SAGA_WORKER_COD_FISCAL`): spun Firebase ce aplicație și ce firmă să proceseze; rămân de configurat înaintea activării.
- **Cheia API SAGA și CUI-ul**: sunt datele prin care FOM se identifică la SAGA. Variabilele există în Vercel, dar validitatea cheii și firma efectivă nu au fost verificate printr-un apel SAGA în această operațiune.

Nu au fost modificate variabilele sau deploymentul Vercel. Nu au fost activate importurile reale. Înaintea activării workerului trebuie verificate configurația, operațiunile restante și modul identic în FOM/Firebase.

## Teste locale

- `npm run build` în `firebase-functions`: trecut.
- `npm run test:invoice-saga`: 9 teste trecute, transport simulat; acoperă dispatcherul, simularea, interpretarea importului, protecția workerului, rapoarte și integritatea documentului.
- Firebase a recompilat funcțiile la publicare; starea finală cloud este consemnată mai jos.

## Verificare finală

Verificare în cloud la **9 noiembrie 2026, 20:06:57, Europe/Bucharest**:

| Resursă | Rezultat |
| --- | --- |
| Reguli publicate | Sursa este identică artefactului limitat SAGA; restul regulilor este identic versiunii publicate anterior. |
| Acces direct anonim | Toate cele 30 de probe refuzate cu HTTP 403. |
| Index `invoiceSagaTransfers` | READY |
| Index `invoiceSagaSimulations` | READY |
| Cele 30 de indexuri preexistente | Păstrate neschimbate. Total: 32. |
| `onInvoiceSagaTransferQueued` | ACTIVE, Node.js 22, `SAGA_WORKER_ENABLED=false`, `SAGA_IMPORT_MODE=dry-run`. |
| `onInvoiceSagaSimulationQueued` | ACTIVE, Node.js 22, `SAGA_WORKER_ENABLED=false`, `SAGA_IMPORT_MODE=dry-run`. |
| `processPendingSagaTransfers` | ACTIVE, Node.js 22, `SAGA_WORKER_ENABLED=false`, `SAGA_IMPORT_MODE=dry-run`. |
| Funcțiile preexistente | Nicio diferență de configurație în comparația înainte/după prin API-urile Cloud Functions v1 și v2. Ordinea nesemnificativă a câmpurilor și filtrelor de evenimente a fost normalizată pentru comparație. |
| Cheia SAGA în funcțiile noi | Absentă; funcțiile folosesc numai secretul intern al workerului. |

Publicarea funcției programate a creat și resursele sale Scheduler/Pub/Sub aferente. Deși funcțiile sunt ACTIVE ca resurse cloud, procesarea SAGA este oprită explicit prin configurare. Nu au fost invocate manual și nu a fost creată nicio operațiune de facturare pentru verificare.

Fișiere locale actualizate: `firebase-functions/package.json`, `firebase-functions/package-lock.json` și fișierul ignorat Git `firebase-functions/.env.field-operational-manager` (doar cele două flaguri SAGA adăugate; setările notificărilor păstrate). Documentele planului/auditului trimit la acest raport. Sursa locală generală `firestore.rules` nu a fost înlocuită cu versiunea cloud, pentru a păstra modificările locale preexistente.

**Rămâne înaintea testului funcțional:** configurarea explicită Vercel a modului de simulare și a parolei interne comune, configurarea URL-ului/firmei în Firebase și activarea controlată a workerului. Verificarea validității cheii SAGA și confirmarea firmei sunt etape ulterioare; publicarea nu le dovedește.

## Impact SAGA

Zero apeluri SAGA, zero importuri, zero facturi sau mișcări de stoc inițiate, zero rotații ale cheii SAGA declanșate de această operațiune. Au fost modificate exclusiv resursele Firebase descrise și configurația locală necesară publicării selective.

## Referințe

- [Auditul inițial](rezultate-testare-saga-etapa-1-2026-11-09.md).
- [Planul de testare](plan-testare-saga-productie.md).

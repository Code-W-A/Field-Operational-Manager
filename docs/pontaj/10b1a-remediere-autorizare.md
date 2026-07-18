# ETAPA 10B.1A - remediere autorizare

Data: 2026-07-17. Implementare si verificare exclusiv locale, pe proiectul Emulator `demo-fom-pontaj-e2e`. Nu s-a facut deploy si nu s-a accesat Firebase live.

## Inventar call-site-uri

Singurul serviciu care apeleaza `POST /api/notifications/hr-request` este `notifyHrRequestEmail` din `lib/hr/storage.ts`.

| Event | Call-site si moment | Actor real | Relatie | Stare deja comisa | Destinatari calculati server-side | Politica aplicata |
|---|---|---|---|---|---|---|
| `created` | `createHrRequest`, dupa tranzactia care creeaza cererea si serialul | tehnician sau admin | `actor.uid == requesterUid` | da, `pending` | manager, requester, salariatul asociat | owner autentificat, rol server-side tehnician/admin |
| `approved` | `decideHrRequest`, ca `status_changed`, dupa tranzactia de decizie | admin sau manager tehnician | admin ori `actor.uid == managerUid` | da, `approved` | requester | permis numai relatiei confirmate |
| `rejected` | `decideHrRequest`, ca `status_changed`, dupa tranzactia de decizie | admin sau manager tehnician | admin ori `actor.uid == managerUid` | da, `rejected` | requester | permis numai relatiei confirmate |
| `edited` | niciun apel | N/A | N/A | N/A | niciunul | deny, event neallowlistat |
| `deleted/cancelled` | niciun apel | N/A | N/A | N/A | niciunul | deny, event neallowlistat |

Ruta citeste privilegiat `hrRequests/{requestId}`, `users/{requesterUid}`, `users/{managerUid}`, `hrEmployees/{employeeId}`, utilizatorul asociat salariatului si `hrDepartments/{sectorId}`. In modul SMTP poate genera atasament PDF/DOCX si poate scrie `emailEvents`; in sink nu construieste transport SMTP, nu genereaza atasamente si nu scrie `emailEvents`.

## Autorizare aplicata

- `requireVerifiedRole` verifica session cookie sau Bearer Firebase ID token, apoi citeste rolul exclusiv din `users/{uid}` cu Admin SDK.
- Payloadul accepta exact `requestId` si `event`; ID-ul are maximum 128 de caractere si charset strict, iar eventurile sunt `created|status_changed`.
- UID, rol, recipient si email din body sunt respinse ca field-uri suplimentare.
- Client, rol necunoscut, utilizator fara rol si anonim sunt refuzati. Dispecerul este refuzat fail-closed; `BUS-01` nu a fost reinterpretat.
- Starea requestului trebuie sa fie `pending` pentru `created` si `approved|rejected` pentru `status_changed`.
- Raspunsul expune cel mult `ok`, `replayed` si `deliveryCount`; nu expune destinatari, config SMTP sau date HR.
- Refuzurile nu scriu marker de dispatch sau `emailEvents`. Logging-ul este numai `console`, nu Firestore.

## Replay si concurenta

Markerul este `hrNotificationDispatches/{requestId}__{event}__{status}`. Claim-ul este tranzactional, are lease de 60 secunde si stari `processing|completed|failed`. Replay dupa succes returneaza rezultatul memorat, iar un apel concurent pe lease activ primeste 409. Un 503 de transport apare inaintea claim-ului, deci poate fi reluat fara marker stale.

Contractul este `BEST_EFFORT_IDEMPOTENCY`, nu exactly-once: daca SMTP livreaza partial si apoi esueaza, markerul devine `failed`; retry-ul dupa lease poate retrimite subsetul deja acceptat de serverul SMTP.

## Callable scheduled works

Call-site UI confirmat: `app/dashboard/contracte/page.tsx`, dupa creare/editare contract. Callable-ul citeste `contracts`, date client/location/equipment si lucrari existente; poate crea `lucrari`, actualiza `contracts/{id}.lastAutoWorkGenerated` si incrementa numarul de raport.

`runGenerateScheduledWorks` cere acum `context.auth.uid`, citeste server-side `users/{uid}`, permite numai `admin` si accepta exclusiv payloadul `{ contractId }`, cu ID obligatoriu pentru callable. Injectarea `uid` sau `role` este refuzata. Politica este derivata din faptul ca ecranul Contracte este administrativ; dispecerul nu a primit drepturi noi.

## Email Functions

Triggerele `onHrRequestCreatedEmail` si `onHrRequestStatusChangedEmail` sunt no-op pentru documentele cu `emailChannel=nextjs`. In plus, transportul SMTP generic din Functions este acum fail-closed: este disponibil numai cand `APP_DEPLOYMENT_ENV=production` si `MAIL_TRANSPORT_MODE=smtp`; configuratia SMTP completa ramane obligatorie. Lipsa markerilor, local si staging nu pot folosi SMTP extern.

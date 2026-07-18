# ETAPA 10B - matrice Rules si Functions

> Actualizare finala: matrice istorica pentru hardening. Staging separat este `SUPERSEDED_BY_OWNER_DECISION`; Rules active in repository sunt temporar open, iar autorizarea endpointului HR/callable ramane obligatorie. Deploy-ul curent nu a fost executat.

Matricea descrie implementarea locala. Coloana staging ramane neexecutata; noile Rules nu au fost deployate.

## Functions si API

| Function/API | Tip | Trigger | Auth necesar in implementare | Roluri confirmate | Validare input | Proba staging |
|---|---|---|---|---|---|---|
| `autoCheckOutScheduleGrace` | scheduled | Pub/Sub, `*/15 17-18 * * *` | identitate scheduler/platforma | N/A | date citite intern; kill-switch false | STAGING_PENDING |
| `autoStopAttendanceSessions` | scheduled | Pub/Sub, `59 23 * * *` | identitate scheduler/platforma | N/A | date citite intern | STAGING_PENDING |
| `onAttendanceCheckoutSync` | Firestore trigger | update `attendance/{sessionId}` | N/A invocare directa | derivat din Rules attendance | verifica tranzitia la `completed`, userId si sessionStart | STAGING_PENDING |
| `sendHrRequestPendingApprovalReminders` | scheduled/email | Pub/Sub, `0 8 * * *` | identitate scheduler/platforma | N/A | query pending, kind si date | BLOCAT SMTP |
| `onHrRequestApproved` | Firestore trigger | update `hrRequests/{requestId}` | N/A invocare directa | derivat din Rules hrRequests | tranzitie status spre approved | STAGING_PENDING |
| `onHrRequestCreatedEmail` | Firestore trigger/email | create `hrRequests/{requestId}` | N/A invocare directa | derivat din Rules hrRequests | skip pentru `emailChannel=nextjs` | BLOCAT SMTP |
| `onHrRequestStatusChangedEmail` | Firestore trigger/email | update `hrRequests/{requestId}` | N/A invocare directa | derivat din Rules hrRequests | status schimbat; skip `emailChannel=nextjs` | BLOCAT SMTP |
| `/api/notifications/hr-request` | Next HTTP POST/Admin/transport explicit | request HTTP | token/session verificat si rol citit server-side | owner tehnician/admin pentru created; admin sau manager tehnician asignat pentru decizie; dispecer deny BUS-01 | payload strict, relatie, stare, transport, marker tranzactional | LOCAL PASS; STAGING_PENDING |
| `runGenerateScheduledWorks` | callable adiacent | HTTPS callable | `context.auth`, document `users/{uid}` | admin | payload strict, `contractId` obligatoriu, fara UID/rol injectat | LOCAL PASS; STAGING_PENDING |

Toate Functions sunt configurate in `europe-west1`; joburile de calendar folosesc `Europe/Bucharest`. SMTP Functions este fail-closed si necesita explicit mediul production plus modul smtp. Triggerele HR sar documentele cu `emailChannel=nextjs`.

## Firestore Rules locale

| Suprafata | Admin | Dispecer | Tehnician | Kiosk | Client/necunoscut/fara rol/anonim | Staging |
|---|---|---|---|---|---|---|
| `users` | administrare | read staff | read staff | read staff | refuz implicit, exceptand propriul doc pentru rol semnat | NEEXECUTAT |
| `hrEmployees`, `hrDepartments`, `hrSettings` | HR permis | HR permis conform caracterizarii curente | read; backfill userUid strict | read | refuz | NEEXECUTAT |
| `attendance`, locks | operator | operator | numai propriul flux | operator | refuz | NEEXECUTAT |
| `hrTimesheets` | HR permis | HR permis | numai salariatul asociat | permis conform contractului local | refuz | NEEXECUTAT |
| `hrRequests`, counters, holidays | HR permis | HR permis | propriile cereri si counter serial strict | read limitat prin staff unde exista | refuz | NEEXECUTAT |
| `logs` | read/create | read/create | create numai propriu | create | refuz | NEEXECUTAT |
| `lucrari` | permis | permis | permis | refuz implicit | client read; celelalte refuz | NEEXECUTAT |
| fallback | deny | deny | deny | deny | deny | NEEXECUTAT |

BUS-01 pentru dispecer ramane o caracterizare, nu o politica noua.

## Storage Rules locale

Selfie attendance, fotografie profil si CM au reguli explicite de owner/rol, MIME si dimensiune. Accesul anonim, path-ul altui utilizator si path-ul aleator sunt refuzate local. Nicio afirmatie nu este promovata la `DEPLOYED_PASSING`; probele Web SDK staging nu au fost executate.

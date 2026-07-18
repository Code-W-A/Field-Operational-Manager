# ETAPA 10B - rezultate RES-007 staging

> `HISTORICAL_RESULT`. Staging separat este `SUPERSEDED_BY_OWNER_DECISION`. Echivalentele locale pentru endpoint HR si callable sunt PASS; proiectul curent este blocat de autorizarea Firebase CLI.

Stare: `STAGING_BLOCKED_NOT_EXECUTED`.

RES-007 nu a fost executat extern deoarece staging nu poate fi identificat. Izolarea tehnica locala a emailului, autorizarea rutei si callable-ul au fost remediate in 10B.1A, dar nu sunt deployate. Nu s-au apelat Functions/API mutante si nu s-au facut probe negative in productie.

## Constatari prin cod

- Attendance Start/Stop este implementat prin Firebase Web SDK si este controlat local de Firestore/Storage Rules, nu printr-o Function callable dedicata.
- `autoCheckOutScheduleGrace`, `autoStopAttendanceSessions` si `sendHrRequestPendingApprovalReminders` sunt joburi programate, nu endpointuri de utilizator.
- `onAttendanceCheckoutSync`, `onHrRequestApproved`, `onHrRequestCreatedEmail` si `onHrRequestStatusChangedEmail` sunt triggere Firestore; autorizarea actiunii initiale depinde de Rules si de cine poate produce tranzitia.
- `/api/notifications/hr-request` verifica identitatea, rolul server-side, relatia cu requestul, starea si transportul. Matricea locala sink/disabled este PASS; remedierea nu este deployata.
- Callable-ul adiacent `runGenerateScheduledWorks` verifica `context.auth`, rolul admin server-side si inputul strict. Probele locale Emulator sunt PASS; remedierea nu este deployata.
- Next si Functions refuza SMTP in staging/local sau cand markerii expliciti lipsesc.

Politica dispecerului ramane fail-closed si clasificata `BUS-01`; nu i-au fost acordate drepturi noi.

## Probe obligatorii restante

Probele locale neautentificat/client/rol necunoscut/fara rol/tehnician/admin/dispecer, payload invalid, UID/rol/recipient falsificat, replay, concurenta si zero mutatii la refuz sunt PASS. Aceleasi probe pe infrastructura deployata, triggerele deployate, retry-ul extern si proiectia staging raman `STAGING_PENDING`.

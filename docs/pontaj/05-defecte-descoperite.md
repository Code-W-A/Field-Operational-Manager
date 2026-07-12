# Etapa 6 - Defecte descoperite

## Calcule

### FIXED_TRAVEL_DOUBLE_COUNT

- Clasificare initiala: `APP_BUG`.
- Vectori: V75, V76.
- Simptom: traseul era adunat atat la C1/C2, cat si la orele de prezenta. Rezultatele observate erau 9h si 8.75h in loc de 8h.
- Remediere: calculul comun al celulei si oglinda Firebase Functions exclud proiectele de traseu din prezenta, pastrandu-le in C1/C2.
- Acoperire: oracle independent, helper aplicatie, unit summary si build Functions.

## Sync

- V40 si V41 confirma paritatea manual + Pontaj la 7.5h.
- Triggerul real `onAttendanceCheckoutSync` a pastrat intrarea manuala si intrarea Pontaj fara dublare.
- Nu a fost identificat un defect blocking ramas in sync pentru vectorii acestei etape.

## Attendance

### CHARACTERIZATION_ACTIVE_WITHOUT_LOCK

- Clasificare: `CHARACTERIZATION`, non-blocking.
- Vector: V54.
- O sesiune active fara lock poate permite crearea unei a doua sesiuni. Intentia business nu este confirmata.

## Lock

### FIXED_CRON_LOCK_SCHEMA

- Clasificare initiala: `APP_BUG`.
- Vectori: V62, V63.
- Cauza: cronul citea `lock.sessionId`, in timp ce aplicatia scrie `lock.activeSessionId`.
- Remediere: Functions foloseste schema curenta si pastreaza compatibilitate cu `sessionId` legacy.
- Acoperire: 3 teste unitare si build Functions. Schedulerul Pub/Sub nu este pornit in aceasta etapa; vectorii raman non-blocking characterization la nivel cron complet.

## Condica

- Textul informativ pentru `WORK` fara `hours`/`entries` a fost aliniat la calculul real de 0h.
- V17, V28 si V35 au proiectii UI trecute.

## Dashboard

- V01 confirma distinctia dintre randul elapsed 8h30 si KPI efectiv 8h.
- Nu a fost identificat un defect blocking nou in subsetul proiectat.

## Profil

- V01 confirma 8h in profil pentru fluxul complet.
- Calculul comun exclude acum traseul din prezenta.

## Raport

- V01 confirma 8h in raport.
- Exportul CSV a fost actualizat prin acelasi helper comun; testele unitare sunt 7/7 PASS.

## Timezone

- V66 si V67 confirma cate 60 minute absolute la ambele tranzitii DST.
- V65 si V71 raman `CHARACTERIZATION`, non-blocking, pentru date legacy cross-month si browser in alt timezone.

## Business Blocked

- V25: nu exista statut business dedicat pentru plecare anticipata.
- V50: fallback-ul legacy pe nume ramane ambiguu la omonime.
- V61: configuratia de deployment pentru auto checkout ramane neverificata.
- V80: C6 foloseste suma bruta a duplicatelor, in timp ce prezenta foloseste union; ramane contradictie semantica non-blocking.

## Test Infrastructure

### FIXTURE_AUTH_RESEED

- Clasificare: `FIXTURE_BUG`, remediat.
- Reseed-ul Auth dintre proiectiile UI invalida storage state-ul admin prin actualizarea parolei.
- Fixture-ul restaureaza acum numai documentele Firestore modificate intre cazuri.

### BASELINE_TYPECHECK

- Clasificare: `TESTABILITY_BLOCKED`, in afara scopului.
- `npx tsc --noEmit` esueaza pe erori preexistente in module neatinse de Etapa 6.
- Build-ul Next.js folosit de suita si build-ul Firebase Functions trec.

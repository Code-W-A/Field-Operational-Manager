# Etapa 4 - Contractul hook-urilor Playwright Pontaj

Principiu: se prefera `getByRole/getByLabel` si helpers externi. Orice mecanism de timp, fault sau invocare Functions trebuie sa fie imposibil de activat in productie. Niciun secret transmis de browser nu transforma un endpoint de test intr-un mecanism sigur.

## Clasificare HOOK-01..20

| ID | Clasificare | Echivalent existent / decizie | Interfata recomandata | Restrictie si risc | Teste deblocate |
|---|---|---|---|---|---|
| HOOK-01 | MUST_BEFORE_TESTS | gridul are numai `title` cu nume si zi | `data-testid="timesheet-cell-{employeeId}-{day}"`, plus `data-employee-id/data-day` | atribut inert, fara date personale suplimentare | CAL, CON-009..015 |
| HOOK-02 | MUST_BEFORE_TESTS | summary cells sunt `div` fara identitate | `data-testid="summary-{metric}-{employeeId}"` | atribut inert; employeeId exista deja client-side | CAL-V73..85, CON-005/006, REP |
| HOOK-03 | NICE_TO_HAVE | CardTitle poate fi localizat si valoarea citita din card | `data-testid="kpi-{name}"` pe valoare | inert | proiectii KPI |
| HOOK-04 | MUST_BEFORE_TESTS | randul dashboard nu expune session ID | `<TableRow data-session-id={session.id}>` | inert | duplicate, concurenta, elapsed |
| HOOK-05 | MUST_BEFORE_TESTS | icon buttons au title, dar entry-urile duplicate nu sunt identificabile | `data-entry-index`, `data-session-id` pe randul intervalului | indexul este doar identitate UI | edit/delete/selfie overlap |
| HOOK-06 | NICE_TO_HAVE | butonul kiosk are nume+rol accesibil, suficient pentru fixtures unice | `data-user-uid={uid}` | UID nu este secret; nu afisa email/parola | omonime, roster |
| HOOK-07 | NOT_NEEDED | headings, dialog titles si toasturi descriu starea | role + accessible name | fara hook | state machine kiosk |
| HOOK-08 | NOT_NEEDED | Start/Stop sunt butoane unice in fiecare context | `getByRole('button',{name})` | fara hook | START/STOP/dublu click |
| HOOK-09 | NICE_TO_HAVE | titlul dialogului este suficient pentru fixture unic | `data-employee-id`, `data-day` pe dialog | inert | dialog zi cu omonime |
| HOOK-10 | NOT_NEEDED | DayPicker expune nume accesibil al datei | role/gridcell/button cu data accesibila | fara hook | timezone/perioade |
| HOOK-11 | NICE_TO_HAVE | CM are label; celelalte uploaduri au accesibilitate partiala | label real pentru input si `data-testid` numai pentru status | nu expune URL/token Storage | erori upload |
| HOOK-12 | NOT_NEEDED | butonul si textul statusului sunt selectabile | role/text; asertare characterization | fara hook | SYN-012 |
| HOOK-13 | NICE_TO_HAVE | butoanele Grid/Lista/Compact au text stabil | adauga `aria-pressed`; testid nu este necesar | imbunatatire a11y, inert | view modes |
| HOOK-14 | MUST_BEFORE_TESTS | charts/SVG si randurile raportului nu au identitate semantica | `data-employee-id`, `data-metric`, fallback tabel accesibil | fara continut E2E-only | REP/CAL projections |
| HOOK-15 | NICE_TO_HAVE | indicatorul are title si text `In lucru` | `data-testid="active-{employeeId}-{day}"` | inert | onSnapshot dens |
| HOOK-16 | MUST_BEFORE_TIME_TESTS | clock localStorage controleaza numai `getAppNowMs`; Functions foloseste `Date.now()` | functii core `handler({nowMs})`; browserul foloseste Playwright Clock instalat pre-navigation | parametrul Functions este intern, nu din request public | STO 60s, cron, DST/timezone |
| HOOK-17 | UNSAFE_AS_PROPOSED | nu exista endpoint cron attendance; scheduler nu se invoca determinist | export intern `runAutoStopAttendanceSessions({nowMs, db})`, apelat de testul Functions emulator | niciun `https.onCall/onRequest` E2E in build; secretul nu este suficient | SYN-006, CAL-V62/63 |
| HOOK-18 | UNSAFE_AS_PROPOSED | Playwright poate mock-ui HTTP; Rules/emulator pot produce permission errors | HTTP prin `page.route`; Storage/Firestore prin emulator/rules sau adapter DI strict in test bundle | un proxy generic de scriere ar fi risc critic | RES, partial-write cases |
| HOOK-19 | UNSAFE_AS_PROPOSED | Firestore ofera concurenta reala, nu winner nominal | fara hook pentru E2E; adapter transaction la integration daca trebuie observat retry-ul | nu introduce pause/release endpoint in productie | STA-017, STO-009, SYN-013, RES-002 |
| HOOK-20 | MUST_BEFORE_TESTS | seed este activ automat in development | `NEXT_PUBLIC_DISABLE_HR_SEED=true` cu precedenta fata de development; seed permis numai prin flag pozitiv explicit | valoare build/test; productie ramane disabled fail-closed | empty/live safety si toate HR emulator |

## Contracte de siguranta

### Timp Functions

```ts
type AttendanceJobDeps = {
  db: FirebaseFirestore.Firestore
  nowMs: number
}

runAutoStopAttendanceSessions(deps): Promise<JobResult>
runScheduleGraceAttendance(deps): Promise<JobResult>
```

Wrapperul Pub/Sub apeleaza functia cu `Date.now()`. Testul de integrare apeleaza direct core-ul cu instant fix. Core-ul nu este exportat prin HTTP si nu citeste `nowMs` din document Firestore.

### Fault injection

- reverse geocode/email HTTP: `page.route` sau server stub cu host allowlist;
- Firestore permission: rules + Web SDK;
- Firestore unavailable: proces emulator controlat la nivel de suita, nu request individual multiplexat;
- scriere timesheet esuata dupa attendance commit: repository adapter injectabil numai in testul integration; pana atunci STO-013 este `TESTABILITY_BLOCKED`;
- Storage: rules emulator, bucket/path controlat si obiect sintetic.

### Concurenta

E2E porneste doua operatii si verifica starea finala. Nu aserteaza care context castiga. Un adapter `beforeCommit` poate exista numai intr-un modul de integration care nu este importat in bundle-ul productiei.

## Ordine

1. HOOK-20, pentru a face setup-ul sigur.
2. HOOK-01/02/04/05/14, pentru P0 projection si duplicate.
3. HOOK-16 si refactorul intern care inlocuieste propunerea HOOK-17.
4. HOOK-03/06/09/11/13/15 numai cand un test concret ramane fragil.
5. HOOK-18/19 nu se implementeaza in forma propusa.

Rezumat: **7 MUST**, **6 NICE_TO_HAVE**, **4 NOT_NEEDED**, **3 UNSAFE_AS_PROPOSED**.

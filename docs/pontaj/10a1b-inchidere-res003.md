# ETAPA 10A.1B - inchidere functionala RES-003

Data: 2026-07-15. Mediu Firebase: numai `demo-fom-pontaj-e2e` prin Emulator. Nu s-au facut deploy-uri si nu s-a accesat Firebase live.

## Cauza confirmata

`auth.setup.ts` creeaza utilizatorii E2E si salveaza sesiunile Playwright. In `external-failures.spec.ts`, apelul ulterior `seedMinimalPontajFixture()` folosea implicit `auth: true`; acesta actualiza utilizatorii Firebase Auth si invalida sesiunea din `storageState`.

Efectul observat era redirect la `/login` pentru `/dashboard/cereri`, deci locatorul `button[name="Cerere"]` lipsea. Nu era un defect al paginii, al selectorului, al Firestore Rules, al Storage Rules sau al launcherului Emulator.

Ruta reala este `/dashboard/cereri`. Controlul este un `button` cu nume accesibil exact `Cerere`; pentru tehnicianul E2E, pagina incarcata are heading-ul `Cererile mele`, iar dupa click dialogul este `Cerere noua`. La esec, URL-ul era `/login`; dupa remediere, artifactul consemneaza URL-ul `/dashboard/cereri`, heading-ul dialogului si butoanele `Anuleaza`, `Trimite cererea` si `Close`. Nu s-au observat `permission-denied`, error boundary sau redirect ulterior.

Identitatea este `tech_e2e_pontaj_stage5`, cu rol `tehnician` in `users/{uid}`; nu se bazeaza pe custom claims. Salariatul `emp_e2e_pontaj_stage5` are `userUid` egal cu UID-ul tehnicianului, departamentul activ si `managerUidBySector` populat. Clientul Web SDK al paginii a citit utilizatorul, salariatul, departamentele si cererile; testele directe RES-005 confirma aceleasi contracte de read pentru tehnician si refuzurile pentru roluri nepermise. Crearea cererii este permisa de contractul `hrRequests` numai cand `requesterUid` este UID-ul curent si `employeeId` ii apartine.

## Remediere

`beforeEach` din `external-failures.spec.ts` foloseste `seedMinimalPontajFixture({ auth: false })`. Datele Firestore necesare testului se re-seed-uiesc, fara modificarea conturilor Auth si fara revocarea sesiunii browserului.

Schimbarea este numai in codul de test. Nu s-au modificat aplicatia, Firebase Functions, regulile sau infrastructura de productie.

## Dovezi

- Artifact: `artifacts/pontaj/10a/res003-request-button-diagnostic.txt`.
  - ruta autentificata `/dashboard/cereri`;
  - dialogul `Cerere noua` este disponibil;
  - requestul este creat o singura data cu `status: pending`;
  - raspunsul 503 al `/api/notifications/hr-request` este interceptat dupa commit.
- `external-failures.spec.ts`, rularea 1 dupa preflight semantic: 3/3 PASS.
- `external-failures.spec.ts`, rularea 2 dupa preflight semantic: 3/3 PASS.
- regresie tintita: requests, Firestore Rules, Storage Rules, production boundary: 19/19 PASS.
- `emulator-stack.spec.ts`: 3/3 PASS; proiectul live este refuzat explicit, iar cleanup-ul canary este idempotent.
- production boundary: markerii/adaptoarele STO si CON nu se regasesc in buildul `.next`.
- cleanup dublu: `remaining: {}`; fara listenere 3100, 8080, 8085, 9099, 9199 si fara procese Firebase/Next din run.

## Limite declarate

Reverse-geocode fara retea, timeout Storage la momentul exact al commitului, expirare Auth exact la commit si erori `deadline-exceeded` raman `TESTABILITY_BLOCKED_NON_BLOCKING`. Nu s-au creat endpoint-uri de test sau hook-uri de productie pentru ele.

In RES-003, apelul `/api/notifications/hr-request` este interceptat cu 503, iar `emailChannel: nextjs` face triggerul Functions no-op. Nu este apelat un serviciu extern de email in cele doua rulari RES-003. Rularea larga, anterioara, a cererilor a aratat separat ca transportul email configurat local nu este inert pentru E2E. Nu a fost Firebase live, dar este un `TEST_ENVIRONMENT_GAP`: viitoarele regresii de cereri trebuie sa foloseasca explicit un transport email no-op/inert.

## Verdict subetapa

`RES_003_EXECUTABLE_COMPLETE_WITH_DECLARED_TESTABILITY_GAPS`

Verdictul global ramane `RESILIENCE_SECURITY_LOCAL_INCOMPLETE`, deoarece RES-008 si celelalte lacune declarate nu fac parte din aceasta inchidere.

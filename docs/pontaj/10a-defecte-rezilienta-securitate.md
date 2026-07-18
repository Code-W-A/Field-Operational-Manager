# ETAPA 10A - defecte

## DEF-SEC-001 - Firestore global deschis

Clasificare: `SECURITY_BUG`, remediat local. Regula finala `allow read, write: if true` permitea Web SDK neautentificat/client sa citeasca sau sa modifice date HR, logs si attendance. `firestore.rules` are acum contracte explicite pe colectie si deny implicit. Regresie: `firestore-rules.spec.ts`.

## DEF-SEC-002 - fallback Storage prea larg

Clasificare: `SECURITY_BUG`, remediat local. Fallback-ul pentru orice utilizator autentificat permitea path-uri selfie/CM ale altora si `random/*`. `storage.rules` permite acum numai path-uri HR/attendance confirmate, cu owner, MIME si limita de marime. Regresie: `storage-rules.spec.ts`.

## Defect de infrastructura de rulare

Clasificare: `CHILD_PROCESS_SIGNAL_BUG`, remediat local in 10A.1A. Launcherul Firebase trimitea semnal doar părintelui, lăsând Pub/Sub Java pe `8085`; launcherul folosește acum process group și propagă SIGTERM/SIGINT către grup. Două smoke-uri consecutive confirmă teardown fără procese sau porturi rămase. Detalii: `10a1a-diagnostic-webserver.md`.

## DEF-RES-003-001 - fixture-ul invalida autentificarea salvata

Clasificare: `FIXTURE_BUG`, remediat local in 10A.1B. `external-failures.spec.ts` apela seed-ul cu optiunea implicita `auth: true` dupa `auth.setup.ts`. Seed-ul actualiza conturile Auth si invalida `storageState`, astfel pagina de cereri ajungea la login, fara ca butonul `Cerere` sa existe.

Remediere: seed-ul din `beforeEach` este `seedMinimalPontajFixture({ auth: false })`. Testul resetaza datele de pontaj, dar pastreaza utilizatorii si sesiunile pregatite de setup. Doua rulări complete consecutive RES-003 confirma commitul persistent dupa 503, fara dublare. Nu s-au modificat UI, Firebase Rules sau launcherul pentru acest defect.

## Risc de izolare externă pentru regresia cererilor

Clasificare: `TEST_ENVIRONMENT_GAP`. Rularea cererilor HR pe Emulator a activat totusi transportul email configurat in mediul local. Firebase live nu a fost accesat, dar acest transport trebuie inlocuit cu un no-op E2E inainte de urmatoarele regresii de cereri. Nu este o remediere RES-003 si nu a fost schimbat in aceasta subetapa.

## DEF-10A1E-001 - rezultat nullable in jurnalizarea sync-ului

Clasificare: `TYPE_SAFETY_BUG`, remediat local. Dupa un sync fara rezultat, `debugPontajLog` primea un `UserDaySyncResult | null`, incompatibil cu contractul sau de obiect. `lib/attendance/storage.ts` trimite acum `pipeline.syncResult ?? {}` doar pentru jurnalizare; valoarea returnata a checkout-ului nu se modifica. Filtrul TypeScript al suprafetei 10A este verde dupa remediere.

## Observatie de executie Kiosk

Clasificare: `SANDBOX_ENVIRONMENT_LIMITATION`, nu defect aplicatie. Sandbox-ul initial a refuzat bind-ul porturilor locale ale Emulator/Next. Rularea identica, autorizata pentru porturi locale si cu fake media, a trecut 23/23. Nu s-a modificat Kiosk pentru a masca problema de infrastructura.

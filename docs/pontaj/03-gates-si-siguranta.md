# Etapa 4 - Gate-uri si siguranta pentru suita Pontaj

Toate gate-urile sunt fail-closed. Un gate sarit produce `skip` numai pentru companionul non-blocking declarat; nu permite fallback spre proiectul live.

| Gate | Mediu | Verificare | Rezultat asteptat | Suite blocate | Mesaj recomandat |
|---|---|---|---|---|---|
| GATE-01 | EMU | health Auth/Firestore/Functions/Storage si proba write/read/delete in proiectul emulator | patru servicii active, app conectata la hosturile locale | toate EMU | `E2E_ABORT: Firebase emulator stack/app connection incomplete` |
| GATE-02 | EMU/STG | compara projectId, authDomain, hosts si allowlist; refuza `field-operational-manager` pentru mutatii locale | proiect explicit `demo-*` sau staging E2E aprobat | toate mutante | `E2E_ABORT: production Firebase project detected` |
| GATE-03 | EMU/STG | regex si lungime pentru runId/prefix; interzice `/`, `..`, ID gol | `E2E_PONTAJ_<UTC>_w<n>` valid | setup/cleanup | `E2E_ABORT: invalid runId or resource prefix` |
| GATE-04 | EMU/STG | creeaza un run canary in toate serviciile, persista manifest, ruleaza cleanup si query zero | zero Auth/docs/objects/logs ramase | toate mutante | `E2E_ABORT: cleanup canary left resources` |
| GATE-05 | EMU/STG | genereaza/login si verifica UID+role pentru admin/disp/tech/kiosk/client/unknown/no-role/unauth | storage states neexpirate, rol exact | auth/routes/UI | `E2E_ABORT: role storage state missing or mismatched` |
| GATE-06 | browser/Functions | browser Clock + Start/Stop la +30/+60; core Functions cu `nowMs` fix | instantele observate egale cu oracle; serverTimestamp doar bounded | time/DST/cron | `E2E_ABORT: deterministic clock is not controlling target layer` |
| GATE-07 | Functions EMU | tranzitie completed declanseaza trigger; core cron se invoca direct cu now fix | trigger convergent si job result observabil | SYN-002/006, STO-014, V41/62/63 | `E2E_ABORT: attendance Functions cannot be invoked deterministically` |
| GATE-08 | EMU | inspecteaza build/env si incearca endpointurile test-only dintr-un context production-like | niciun endpoint/proxy fault accesibil; mock-urile au host allowlist | RES/faults | `E2E_ABORT: fault injection can escape test environment` |
| GATE-09 | EMU | verifica modul fiecarui concurrency test | bariera integration disponibila sau test declarat final-invariant-only | concurrency | `E2E_ABORT: test requires nominal winner without barrier` |
| GATE-10 | EMU/LIVE | verifica `NEXT_PUBLIC_DISABLE_HR_SEED=true` local; in live metadata demonstreaza seed disabled | deschiderea HR nu produce write in baza goala/canary | routes/HR/CON/REP | `E2E_ABORT: seedHrIfEmpty is not disabled` |
| GATE-11 | STG | citeste Vercel SHA, Functions labels/version si rules release; compara cu commit aprobat | toate versiunile capturate si compatibile | staging mutating/contract | `E2E_ABORT: staging deployment SHA/rules unknown or mismatched` |
| GATE-12 | EMU | instrumenteaza probele Rules si verifica SDK folosit | arrange/cleanup Admin; actiune Web SDK cu Auth emulator | RES-005/006 | `E2E_ABORT: Rules assertion executed through Admin SDK` |
| GATE-13 | LIVE | allowlist de test IDs/read actions, interceptare Firestore write/Storage upload/API mutating si redactare artefacte | zero request mutating; zero seed; zero PII in artefacte | LIVE_RO | `E2E_ABORT: live smoke attempted or could attempt a write` |
| GATE-14 | EMU/STG | snapshot exact defaults/holidays/counter, mutex suita, restore si deep equality | egalitate byte/semantic cu before | singleton suites | `E2E_ABORT: singleton restore failed` |
| GATE-15 | CI | proiectele manuale excluse din grep/tag blocking si cer opt-in | niciun DEV/MANUAL in blocking CI | manual device | `E2E_ABORT: manual-device test included in blocking project` |

## Protectia productiei

1. Mutatiile sunt permise numai daca projectId apartine allowlist-ului si hosturile emulator sunt prezente sau staging-ul are token explicit de aprobare.
2. Variabilele `.env` nu sunt considerate dovada; global setup citeste valorile efective folosite de browser si Admin SDK.
3. Helperul Admin refuza credentialele live cand `E2E_MUTATING=true` si lipseste `E2E_APPROVED_STAGING_PROJECT`.
4. Niciun test nu face fallback automat de la emulator indisponibil la Firebase implicit.
5. LIVE_RO foloseste proiect Playwright separat, fara Admin credentials, fara geolocation/camera daca nu sunt necesare si fara dumpuri de documente.
6. Screenshot/trace live se redacteaza sau se dezactiveaza pe paginile cu CNP, CI, selfie, adrese si documente medicale.

## Seed si singleton-uri

- `NEXT_PUBLIC_DISABLE_HR_SEED=true` are precedenta fata de `NODE_ENV=development`.
- Singleton suites ruleaza cu un mutex de proces/proiect si isi scriu snapshotul in manifest inainte de prima mutatie.
- Daca procesul este intrerupt, urmatorul global setup ruleaza recovery dupa manifest; staging are janitor cu TTL 24h.
- Emulatorul poate fi resetat integral numai cand este dedicat acelui run.

## Functions

Pornirea Functions Emulator nu executa automat schedulerul la ora simulata. GATE-07 cere separat:

- trigger Firestore prin scriere in Firestore Emulator;
- job Pub/Sub prin apel direct al core-ului intern;
- config/flags `AUTO_CHECKOUT_ENABLED`, `AUTO_EOD_STOP_ENABLED` si timezone capturate;
- servicii externe SMTP dezactivate sau directionate catre stub.

## Starea curenta

La data auditului:

- GATE-01: FAIL;
- GATE-02: FAIL, nu exista guard global;
- GATE-03: proiectat, neimplementat;
- GATE-04: FAIL;
- GATE-05: partial doar pentru suita real existenta;
- GATE-06: partial client, FAIL Functions;
- GATE-07: FAIL;
- GATE-08: FAIL;
- GATE-09: FAIL pentru cazurile cu winner/commit nominal;
- GATE-10: FAIL in development;
- GATE-11: neconfirmat;
- GATE-12: neimplementat;
- GATE-13: neimplementat;
- GATE-14: neimplementat;
- GATE-15: proiectat, neimplementat.

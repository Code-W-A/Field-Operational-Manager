# ETAPA 9A.1D - gate final si verdict fundatie HR

Data executiei: 2026-07-13. Toate suitele E2E au folosit Firebase Emulator Suite cu proiectul `demo-fom-pontaj-e2e`. Nu s-a accesat Firebase live si nu s-a facut deploy.

## Rezultate executabile

| Gate | Rezultat efectiv |
| --- | --- |
| Fundatie HR unificata + production boundary | 20 PASS: setup Auth 1, teste HR 18, boundary 1; 0 FAIL, 0 SKIP |
| Condica + production boundary, `workers=1` | 35 PASS |
| Kiosk, fake media izolat | 22 PASS |
| Core RT/STA/STO/SYN + emulator stack + boundary | 75 PASS |
| Selectie istorica atomica V01-V85, registry, proiectii, V01 flow, route smoke, Start si Stop | 107 PASS |
| Unit HR/attendance/functions | 105 PASS; rerulare relevanta dupa corectia de tipizare: 22 PASS |
| Next.js | PASS (`npm run build`); build-ul sare intentionat typecheck si lint |
| Firebase Functions | PASS (`npm run build` in `firebase-functions`) |
| `git diff --check` | PASS |

Core confirma explicit Start dupa asociere `userUid`, snapshotul de program si pauza, Stop, lock, sincronizarea client, triggerul Functions si cronul. Kiosk confirma roster, asociere, Start/Stop, selfie, logout si concurenta in mediul cu media falsa.

## HR-007 si lint

- `TESTABILITY_BLOCKED_NON_BLOCKING` pentru ramura browser de eroare a abonarii `hrTimesheets`: pagina are starea persistenta loading/error/retry si `subscribeTimesheetsForMonth` expune `onError`, dar nu exista un adapter injectabil. Un mock din `tests/` nu poate controla modulul deja legat in bundle; un hook browser sau un marker importat de productie ar incalca restrictia de production boundary. Nu a fost introdus un astfel de mecanism.
- `NOT_CONFIGURED_NON_BLOCKING` pentru lint: `package.json` declara scriptul legacy `next lint`, proiectul nu are binar/config ESLint neinteractiv, iar `next.config.mjs` are `eslint.ignoreDuringBuilds`. Nu a fost pornit niciun wizard si nu s-a schimbat configuratia.
- Typecheck-ul global este baseline FAIL cu erori istorice in module neatinse. Filtrarea pentru `salariati/[id]`, `lib/hr/storage`, normalizatorul HR si testele HR nu mai raporteaza erori dupa tiparea parametrului din `removeUndefined`.

## Siguranta Firebase si boundary

- Testul `emulator-stack.spec.ts` din rularea Core a executat guardul: `field-operational-manager` este refuzat, iar `demo-fom-pontaj-e2e` este acceptat.
- `production-boundary.spec.ts` a trecut in rularea HR, Condica si Core.
- Verificarea post-build a `.next/static` si `.next/server` nu a gasit `PONTAJ_TEST_ONLY_CHECKOUT_ADAPTER` sau `PONTAJ_TEST_ONLY_CONDICA_ADAPTER`.
- Nu exista un adapter nou pentru HR-007, deci nu exista marker nou de verificat in bundle.

## Cleanup final

Cleanup-ul manual a rulat intr-un Emulator Suite local separat, de doua ori, cu rezultatul exact:

```json
{
  "cleanupRuns": 2,
  "remaining": {}
}
```

## Verdict

`HR_FOUNDATION_EXECUTABLE_COMPLETE`

Clasificarile non-blocking de mai sus nu sunt defecte functionale ale fundatiei HR. Politica Firestore permisiva pentru dispecer (BUS-01) ramane o contradictie de autorizare documentata, neadresata conform restrictiei de a nu inventa politici business.

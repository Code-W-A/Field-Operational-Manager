# ETAPA 8B.3 - regresie completa

Toate suitele de mai jos au fost rulate dupa corectiile Condicii, cu `workers=1` unde exista emulator/server comun. Toate datele au ramas in `demo-fom-pontaj-e2e`.

| Domeniu | Comanda / selectie | Rezultat |
| --- | --- | --- |
| Condica + production boundary | `condica` + `production-boundary.spec.ts` | PASS, 35/35 (setup 1, CON 33, boundary 1) |
| Kiosk complet | `tests/e2e/pontaj/kiosk` cu `PONTAJ_KIOSK_FAKE_MEDIA=true` | PASS, 22/22 |
| Core RT/STA/STO/SYN | `routes start stop sync` | PASS, 75/75 |
| Istoric reconciliat, inclusiv V01-V85/registry/proiectii | `calculations`, V01 flow, route smoke, start si stop | PASS, 107/107 |
| Unitare relevante | summary, request-sync, overtime | PASS, 24/24 |
| Build Next.js | `npm run build` | PASS |
| Build Firebase Functions | `npm --prefix firebase-functions run build` | PASS |
| Emulator stack/live guard/production boundary | `emulator-stack.spec.ts` + `production-boundary.spec.ts` | PASS, 4/4 (setup inclus) |
| Cleanup | `cleanup-run.ts` in emulator | PASS, `cleanupRuns: 2`, `remaining: {}` |
| Diff | `git diff --check` | raportat separat la finalul etapei |

## Verificari tehnice cu rezultat declarat

- `npm run lint` nu este executabil ca lint: scriptul `next lint` deschide wizard de configurare deoarece proiectul nu are configuratie ESLint. Nu s-a acceptat configurarea interactiva in aceasta etapa.
- `./node_modules/.bin/tsc --noEmit` esueaza pe erori TypeScript istorice si nelegate din alte module ale repository-ului; nu este un semnal verde global. Buildul Next.js este verde, dar el afiseaza explicit ca skip-uieste validarea de tipuri si linting.
- Primele doua incercari manuale de cleanup nu au pornit din cauza caii CLI/cache; nu au mutat date. Rularea finala cu HOME temporar a trecut.

Nu s-a facut deploy, nu s-a folosit Firebase live si nu s-a inceput HR/REP/RES/staging.

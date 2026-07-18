# ETAPA 9A.2C - reconciliere Core 74 versus 75

## Decizie

Varianta C/D: nu a disparut niciun test. Comanda Core folosita in 9A.2B a exclus `tests/e2e/pontaj/stop/stop-minimum.spec.ts`, unde se afla `STO-002` si `STO-003`. Cele 74 din `--list` erau: setup 1, RT 20, STA 20, STO 16, SYN 14, emulator-stack 2 si production-boundary 1. Aceasta selectie acoperea numai 70/72 cazuri logice.

Baseline-ul `75` este metadata inconsistentă: documentul anterior `08a-rezultate-kiosk.md` consemneaza deja `74/74`. Nu exista commit sau test sters care sa justifice 75.

## Inventar normalizat

Comanda Core completa adauga `stop-minimum.spec.ts` si are:

| Familie | Teste Playwright | ID-uri logice |
| --- | ---: | ---: |
| RT | 20 | RT-001..RT-020 |
| STA | 20 | STA-001..STA-020 |
| STO | 18 | STO-001..STO-018 |
| SYN | 14 | SYN-001..SYN-014 |
| Setup Auth | 1 | - |
| Emulator stack | 2 | - |
| Production boundary | 1 | - |
| Total | 76 | 72/72 |

`--list` pentru selectia veche a raportat mecanic `Total: 74 tests in 7 files`. Rerularea atomica normalizata a raportat `76 PASS, 0 FAIL, 0 SKIP`.

Comanda folosita:

```sh
npx playwright test -c playwright.pontaj.config.ts tests/e2e/pontaj/routes/access.spec.ts tests/e2e/pontaj/start/core-start.spec.ts tests/e2e/pontaj/stop/core-stop.spec.ts tests/e2e/pontaj/stop/stop-minimum.spec.ts tests/e2e/pontaj/sync/core-sync.spec.ts tests/e2e/pontaj/infrastructure/emulator-stack.spec.ts tests/e2e/pontaj/infrastructure/production-boundary.spec.ts --project=pontaj-vectors --workers=1
```

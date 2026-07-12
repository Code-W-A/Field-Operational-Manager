# ETAPA 8B - rezultate Condica

Data executiei: 2026-07-12. Toate mutatiile au folosit exclusiv proiectul emulator `demo-fom-pontaj-e2e`.

## Poarta istorica

Selectia atomica din etapa 8A.1 a trecut: **107/107**.

```sh
npx playwright test tests/e2e/pontaj/calculations tests/e2e/pontaj/flow/v01-complete-flow.spec.ts tests/e2e/pontaj/routes/access-smoke.spec.ts tests/e2e/pontaj/start/start-basic.spec.ts tests/e2e/pontaj/stop/stop-minimum.spec.ts --config=playwright.pontaj.config.ts --workers=1
```

## Contracte executate

| Caz | Fisier | Rezultat |
| --- | --- | --- |
| CON-001..004 | `read.spec.ts` | PASS, 4 cazuri |
| CON-005..007 | `summary.spec.ts` | PASS, 3 cazuri |
| CON-008 | `realtime.spec.ts` | PASS, 1 caz |
| CON-011..014, CON-016 | `write.spec.ts` | PASS, 4 cazuri |
| CON-022 | `export.spec.ts` | PASS, 1 caz |

Comenzi executate local: `read + summary` (8/8, din care 7 Condica si setup Auth), `write` (5/5, din care 4 Condica si setup Auth), `realtime + export` (3/3, din care 2 Condica si setup Auth). Cleanup-ul global Playwright a rulat de doua ori si a raportat `remaining: {}` pentru fiecare rulare.

## Corectii validate

- Adaugarea manuala nu accepta intervale intre luni sau in afara lunii afisate.
- Adaugarea pe mai multe zile scrie celulele intr-un singur commit Firestore pentru documentul lunar.
- Sumarul de traseu recunoaste `travelToClient`, campul scris de dialogul actual, si pastreaza compatibilitatea cu etichetele legacy din `project`.
- Condica expune loading, error, empty si hook-uri stabile pentru celule/rezumate/dati.
- `DateInput` accepta explicit ISO si `dd.MM.yyyy`, pe langa formatul local deja afisat.

## Limite ale executiei

CON-009, 010, 015, 017, 018, 019, 020 si 021 nu sunt inca executate. In special, CON-017/018 necesita un adapter sigur pentru eroare determinista de scriere, care nu a fost adaugat in aceasta rulare.

Verdict intermediar: **CONDICA_EXECUTABLE_INCOMPLETE**.

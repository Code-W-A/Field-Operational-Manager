# ETAPA 8B - rezultate Condica

Data ultimei executii: 2026-07-13. Toate mutatiile au folosit exclusiv proiectul emulator `demo-fom-pontaj-e2e`.

## Executie unificata Condica

```sh
npx playwright test tests/e2e/pontaj/condica tests/e2e/pontaj/infrastructure/production-boundary.spec.ts --config=playwright.pontaj.config.ts --workers=1
```

**35 passed, 0 failed, 0 skipped**: setup Auth = 1; teste CON = 33, care acopera CON-001..CON-022; production-boundary = 1. CON-017 are doua clasificari: contractul atomic este PASS, iar injectarea de fault prin UI real este `TESTABILITY_BLOCKED_NON_BLOCKING` prin restrictie de productie.

## Corectii validate

- Stergerea cu interval inversat respinge submit-ul, pastreaza dialogul si nu scrie nimic.
- `Elimina CO` inlocuieste efectiv mapa zilei: `sourceRequestId`, `sourceRequestKind`, `hours`, intervalele si pauzele stale dispar.
- Editarea unei cereri CO aprobate resincronizeaza zilele si pastreaza auditul managerului.
- Sarbatorile raman draft pana la Save, sunt sortate, deduplicate, primesc metadata si singletonul este restaurat exact dupa test.
- Stergerea multi-zi are contract atomic, retry idempotent si convergenta in doua taburi.
- Dialogurile testate au role/nume accesibile, contract de focus/Escape si constrangeri responsive DOM, fara screenshot-only comparison.
- Adapterele de fault raman sub `tests/` si nu apar in `.next`.

## Caracterizare, nu promisiune de atomicitate

Pentru eroarea de resync CO, request update-ul si auditul pot ramane comise, iar timesheet-ul vechi pana la retry. Testul verifica starea reala si absenta duplicatelor; nu afirma fals ca cele doua documente au un commit atomic comun.

Verdict: **CONDICA_EXECUTABLE_COMPLETE_WITH_DECLARED_TESTABILITY_GAP**.

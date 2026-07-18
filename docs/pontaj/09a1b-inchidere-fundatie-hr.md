# ETAPA 9A.1B - diagnostic HR-005

Executie: 2026-07-13, numai `demo-fom-pontaj-e2e` si Firebase Emulator Suite.

## DEF-HR-007: manager-sector stale

Clasificare: `APP_BUG`, remediat.

### Reproducere si dovada

Document initial:

```text
sectorIds: [A, B]
managerUidBySector: { A: managerA, B: managerB }
```

In dialog, dupa deselectarea lui B, React are `sectorIds: [A]`, iar selectorul lui B dispare. Functia pura de normalizare produce payloadul corect:

```text
sectorIds: [A]
managerUidBySector: { A: managerA }
```

Documentul Firestore avea totusi `sectorIds: [A]` si `managerUidBySector: { A: managerA, B: managerB }`.

### Cauza exacta

`createOrUpdateEmployee` folosea `setDoc(ref, data, { merge: true })`. Pentru campul map, Firestore face merge pe chei: payloadul `{ A: managerA }` nu sterge cheia B existenta. React si payloadul nu erau sursa reaparitiei lui B.

Un risc secundar era efectul dialogului care depindea de defaults. Un snapshot intarziat al defaults putea reincarca draftul de editare din documentul initial. Efectul depinde acum doar de `open` si `employee`; defaults initializeaza numai dialogul de creare.

### Remediere

- `lib/hr/employee-sector-assignment.ts` normalizeaza pur `sectorIds` si `managerUidBySector`.
- Dialogul si storage folosesc aceeasi normalizare.
- `createOrUpdateEmployee` citeste maparea existenta intr-o tranzactie, face set cu merge pentru toate campurile si aplica `deleteField()` pentru fiecare cheie de manager-sector care nu mai este selectata.
- Celelalte campuri ale documentului raman actualizate prin merge; numai cheile stale ale mapei sunt eliminate fizic.

### Regresii

| Test | Rezultat |
| --- | --- |
| `lib/hr/employee-sector-assignment.test.ts` | PASS, 5: eliminare, golire, schimbare manager, duplicate/valori goale, sector inexistent |
| `salariati/managers-minimal.spec.ts` | PASS: `[A,B] -> [A]`, Admin SDK, refresh si redeschidere |
| `salariati/managers.spec.ts` | PASS: creare doua asocieri, modificare si eliminare dupa refresh |

Comanda Playwright: `npx playwright test -c playwright.pontaj.config.ts tests/e2e/pontaj/salariati/managers-minimal.spec.ts tests/e2e/pontaj/salariati/managers.spec.ts --project=pontaj-vectors`.

## Stare fundatie

HR-005 este `IMPLEMENTED_PASSING`. HR-007, HR-013, contractele dialogurilor si regresia unificata raman in lucru pentru inchiderea completa a etapei 9A.1B.

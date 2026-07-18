# ETAPA 8B - defecte Condica

## Remediate

1. **DEF-001: traseul manual omis din sumar.** `AddDayEntryDialog` scria `travelToClient: true`, iar sumarul citea doar `project === "traseu catre client"`. Corectat in `lib/hr/timesheet-summary.ts`; regresie CON-006.
2. **DEF-002: risc de scrieri partiale multi-zi.** Dialogul apela `upsertTimesheetCell` in bucla. Corectat prin `upsertTimesheetCells`, un singur commit lunar; regresie CON-012.
3. **DEF-003: date din alta luna puteau ajunge in documentul curent.** Corectat in dialog si defensiv in pagina; regresie CON-014/016.
4. **DEF-004: loading/error/empty nereprezentate.** Erorile pentru salariat/condica nu erau expuse; pagina are acum stari explicite si retry.
5. **DEF-005: overlap raportat drept succes.** Handlerul afisa toast si rezolva promisiunea; dialogul se inchidea. Corectat prin respingerea promisiunii; regresie CON-015.
6. **DEF-006: Escape blocat pentru dialoguri.** `DialogContent` prevenea neconditionat Escape. Corectat; regresie CON-009/021.
7. **DEF-007: Clear CO pastra metadata stale.** Merge-ul nested lasa campuri Firestore eliminate local. Corectat prin inlocuirea explicita a mapei `days.{day}`; regresie CON-020.
8. **DEF-008: stergerea inversata era declarata fals succes.** Handlerul facea `return`, iar dialogul il interpreta ca succes. Corectat prin reject; regresie CON-018.

## Clasificari 8B.3

- **TEST_BUG, corectat:** in testul a11y, inchiderea unui dialog inchidea si popover-ul parinte; helperul redeschide explicit detaliul inainte de urmatorul dialog. Nu era defect al aplicatiei.
- **CHARACTERIZATION:** la resync CO esuat dupa update, request-ul/auditul pot fi comise inainte ca timesheet-ul sa fie actualizat. Este testat si documentat, fara inventarea unei reguli de business.
- **TESTABILITY_BLOCKED_NON_BLOCKING:** fault injection UI real pentru CON-017 ramane interzis fara hook de productie. Contractul atomic este totusi demonstrat cu adapter izolat sub `tests/` si boundary production-like verde.

Nu exista APP_BUG executabil ramas deschis pentru CON-018, CON-019, CON-020 sau CON-021.
